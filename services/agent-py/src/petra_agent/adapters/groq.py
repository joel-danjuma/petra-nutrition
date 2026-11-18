"""Groq's OpenAI-compatible chat API behind ChatModel and ModelProvider.

Talks HTTP directly over the shared ``httpx.AsyncClient`` rather than through a
vendor SDK, so the timeouts, the retry rule and what gets logged are all
decided here, in one reviewable place (KI-20).

Every failure leaves as a ``ProviderError`` whose message is safe to show a
user. Logs carry the status and Groq's error code, never a prompt, a reply or
Groq's own message, which can quote either.
"""

import asyncio
import json
import math
import re
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Literal

import httpx
from tenacity import AsyncRetrying, RetryCallState, retry_if_exception, stop_after_attempt

from petra_agent.adapters.retry_policy import UpstreamError, backoff_seconds, should_retry
from petra_agent.log import get_logger
from petra_agent.ports import (
    ChatMessage,
    ChatModel,
    Completion,
    ModelProvider,
    ModelRole,
    ProviderUnavailable,
    RateLimited,
)
from petra_agent.settings import Settings

UNAVAILABLE = "AI service is currently unavailable"
DAILY_LIMIT = "Petra has reached today's AI usage limit. It resets at midnight UTC."
# What the TypeScript agent assumed when Groq named no wait.
DEFAULT_RETRY_AFTER_S = 2.0
TOP_P = 0.9

_DAILY = re.compile(r"per day|\bTPD\b|\bRPD\b", re.IGNORECASE)
_TRY_AGAIN = re.compile(
    r"try again in (?:(?P<h>\d+)h)?(?:(?P<m>\d+)m(?!s))?(?:(?P<s>\d+(?:\.\d+)?)s)?",
    re.IGNORECASE,
)

log = get_logger(__name__)

Sleep = Callable[[float], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class RoleConfig:
    smart: bool
    temperature: float
    max_tokens: int
    reasoning_effort: Literal["low", "medium", "high"]
    json: bool


# docs/agent-spec.md §7: the only model-choice policy. The unused `search` row is gone (KI-37).
ROLES: Mapping[ModelRole, RoleConfig] = {
    "router": RoleConfig(False, 0.0, 400, "low", True),
    "compose": RoleConfig(True, 0.4, 3000, "medium", True),
    "nutrition": RoleConfig(False, 0.0, 600, "low", True),
    "respond": RoleConfig(False, 0.7, 3000, "low", False),
    "enrich": RoleConfig(False, 0.3, 2000, "low", True),
}


class _Malformed(Exception):
    """A 200 whose body is not a usable completion."""


def _retry_after(response: httpx.Response, message: str) -> float | None:
    header = response.headers.get("retry-after")
    if header is not None:
        try:
            return max(0.0, float(header))
        except ValueError:
            pass
        try:
            when = parsedate_to_datetime(header)
        except (TypeError, ValueError):
            when = None
        if when is not None:
            return max(0.0, (when - datetime.now(UTC)).total_seconds())

    found = _TRY_AGAIN.search(message)
    if found is None or not any(found.group(g) for g in ("h", "m", "s")):
        return None
    return (
        int(found.group("h") or 0) * 3600
        + int(found.group("m") or 0) * 60
        + float(found.group("s") or 0)
    )


def _upstream(response: httpx.Response) -> UpstreamError:
    message, code = "", None
    try:
        error = response.json().get("error", {})
        message = str(error.get("message", ""))
        code = str(error["code"]) if error.get("code") else None
    except (ValueError, AttributeError):
        pass
    return UpstreamError(
        response.status_code,
        retry_after_s=_retry_after(response, message),
        daily=response.status_code == 429 and bool(_DAILY.search(message)),
        code=code,
    )


def _text_of(payload: object) -> tuple[str, str | None, int | None]:
    if not isinstance(payload, dict):
        raise _Malformed("body is not an object")
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise _Malformed("no choices")
    message = choices[0].get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str):
        raise _Malformed("no content")
    model = payload.get("model")
    return content, model if isinstance(model, str) else None, _tokens(payload.get("usage"))


def _tokens(usage: object) -> int | None:
    total = usage.get("total_tokens") if isinstance(usage, dict) else None
    return total if isinstance(total, int) else None


class GroqChatModel(ChatModel):
    def __init__(
        self,
        *,
        role: ModelRole,
        model_id: str,
        config: RoleConfig,
        settings: Settings,
        http: httpx.AsyncClient,
        sleep: Sleep,
    ) -> None:
        self._role = role
        self._model_id = model_id
        self._config = config
        self._settings = settings
        self._http = http
        self._sleep = sleep
        connect = settings.groq_connect_timeout_seconds
        self._timeout = httpx.Timeout(
            connect=connect, read=settings.groq_read_timeout_seconds, write=connect, pool=connect
        )

    @property
    def role(self) -> ModelRole:
        return self._role

    @property
    def model_id(self) -> str:
        return self._model_id

    async def complete(self, messages: Sequence[ChatMessage]) -> Completion:
        response = await self._send(self._body(messages, stream=False), stream=False)
        try:
            text, model, tokens = _text_of(response.json())
        except (ValueError, _Malformed) as error:
            raise self._unavailable("malformed completion", error) from error
        return Completion(text, model or self._model_id, tokens)

    async def stream(
        self, messages: Sequence[ChatMessage], on_delta: Callable[[str], None]
    ) -> Completion:
        # Retries end here: once the stream is open, a delta may be forwarded,
        # and a restart would send it twice (KI-36).
        response = await self._send(self._body(messages, stream=True), stream=True)
        parts: list[str] = []
        tokens: int | None = None
        finished = False
        try:
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    finished = True
                    break
                chunk = json.loads(data)
                for choice in chunk.get("choices") or []:
                    delta = (choice.get("delta") or {}).get("content")
                    if delta:
                        parts.append(delta)
                        on_delta(delta)
                tokens = _tokens((chunk.get("x_groq") or {}).get("usage")) or tokens
        except (httpx.HTTPError, ValueError, AttributeError) as error:
            raise self._unavailable("stream broke", error) from error
        finally:
            await response.aclose()

        if not finished:
            raise self._unavailable("stream ended before [DONE]", None)
        return Completion("".join(parts), self._model_id, tokens)

    def _body(self, messages: Sequence[ChatMessage], *, stream: bool) -> dict[str, object]:
        config = self._config
        body: dict[str, object] = {
            "model": self._model_id,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": config.temperature,
            "top_p": TOP_P,
            "max_completion_tokens": config.max_tokens,
            "reasoning_effort": config.reasoning_effort,
        }
        if config.json:
            body["response_format"] = {"type": "json_object"}
        if stream:
            body["stream"] = True
        return body

    async def _send(self, body: dict[str, object], *, stream: bool) -> httpx.Response:
        """POST with the retry policy. Returns a 200; raises a ProviderError otherwise."""
        retrying = AsyncRetrying(
            stop=stop_after_attempt(self._settings.groq_max_attempts),
            retry=retry_if_exception(should_retry),
            wait=self._wait,
            sleep=self._sleep,
            before_sleep=self._log_retry,
            reraise=True,
        )
        try:
            async for attempt in retrying:
                with attempt:
                    return await self._attempt(body, stream=stream)
        except UpstreamError as error:
            raise self._mapped(error) from error
        except httpx.HTTPError as error:
            raise self._unavailable("request failed", error) from error
        raise AssertionError("unreachable: tenacity reraises the last failure")

    async def _attempt(self, body: dict[str, object], *, stream: bool) -> httpx.Response:
        request = self._http.build_request(
            "POST",
            f"{self._settings.groq_base_url}/chat/completions",
            json=body,
            headers={"Authorization": f"Bearer {self._settings.groq_api_key.get_secret_value()}"},
            timeout=self._timeout,
        )
        response = await self._http.send(request, stream=stream)
        if response.status_code == 200:
            return response
        if stream:
            await response.aread()
            await response.aclose()
        raise _upstream(response)

    @staticmethod
    def _wait(state: RetryCallState) -> float:
        error = state.outcome.exception() if state.outcome is not None else None
        if error is None:
            return 0.0
        return backoff_seconds(error, attempt=state.attempt_number)

    def _log_retry(self, state: RetryCallState) -> None:
        error = state.outcome.exception() if state.outcome is not None else None
        log.info(
            "retrying groq call",
            role=self._role,
            attempt=state.attempt_number,
            wait_s=round(state.upcoming_sleep, 2),
            reason=error.status if isinstance(error, UpstreamError) else type(error).__name__,
        )

    def _mapped(self, error: UpstreamError) -> Exception:
        fields = {"role": self._role, "model": self._model_id, "status": error.status}
        if error.status in (401, 403):
            log.error("groq rejected the api key", **fields)
            return ProviderUnavailable(UNAVAILABLE)
        if error.status != 429:
            log.warning("groq call failed", code=error.code, **fields)
            return ProviderUnavailable(UNAVAILABLE)

        log.warning(
            "groq rate limited", daily=error.daily, retry_after_s=error.retry_after_s, **fields
        )
        if error.daily:
            return RateLimited(DAILY_LIMIT, retry_after_s=error.retry_after_s, daily=True)
        wait = error.retry_after_s if error.retry_after_s is not None else DEFAULT_RETRY_AFTER_S
        return RateLimited(
            f"Petra is at its rate limit. Try again in about {math.ceil(wait)} seconds.",
            retry_after_s=wait,
        )

    def _unavailable(self, what: str, error: Exception | None) -> ProviderUnavailable:
        log.warning(
            f"groq {what}",
            role=self._role,
            model=self._model_id,
            error=type(error).__name__ if error is not None else None,
        )
        return ProviderUnavailable(UNAVAILABLE)


class GroqModels(ModelProvider):
    """``model_for(role)``: the one way a node reaches a Groq model."""

    def __init__(
        self, settings: Settings, http: httpx.AsyncClient, *, sleep: Sleep = asyncio.sleep
    ) -> None:
        self._settings = settings
        self._http = http
        self._sleep = sleep

    def model_for(self, role: ModelRole, *, model: str | None = None) -> ChatModel:
        config = ROLES[role]
        default = (
            self._settings.groq_model_smart if config.smart else self._settings.groq_model_fast
        )
        return GroqChatModel(
            role=role,
            model_id=model or default,
            config=config,
            settings=self._settings,
            http=self._http,
            sleep=self._sleep,
        )
