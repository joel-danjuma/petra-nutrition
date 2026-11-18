"""The Groq adapter, against respx. No test reaches the network: the base URL is
unresolvable and respx refuses any request it has no route for."""

import asyncio
import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

import httpx
import pytest
import respx
import structlog
from pydantic import SecretStr

from petra_agent.adapters.groq import GroqModels
from petra_agent.ports import ChatMessage, ModelRole, ProviderUnavailable, RateLimited
from petra_agent.settings import Settings

BASE = "https://api.groq.test/openai/v1"
KEY = "gsk_test_key"
PROMPT = [ChatMessage("system", "Allergies: peanut"), ChatMessage("user", "dinner ideas?")]


@pytest.fixture
def groq() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=BASE, assert_all_called=False) as router:
        yield router


class Harness:
    def __init__(self, **overrides: Any) -> None:
        values: dict[str, Any] = {
            "node_env": "test",
            "database_url": SecretStr("postgresql://agent@db/petra"),
            "groq_api_key": SecretStr(KEY),
            "groq_base_url": BASE,
        }
        self.settings = Settings(_env_file=None, **{**values, **overrides})
        self.sleeps: list[float] = []
        self.http = httpx.AsyncClient()

        async def sleep(seconds: float) -> None:
            self.sleeps.append(seconds)

        self.models = GroqModels(self.settings, self.http, sleep=sleep)


def completion(
    text: str = "Try the curry.", *, model: str = "openai/gpt-oss-20b"
) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "chatcmpl-1",
            "model": model,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": text}}],
            "usage": {"prompt_tokens": 30, "completion_tokens": 12, "total_tokens": 42},
        },
    )


def rate_limited(
    message: str = "Rate limit reached on tokens per minute (TPM). Please try again in 3s.",
    *,
    retry_after: str | None = "3",
) -> httpx.Response:
    headers = {"retry-after": retry_after} if retry_after is not None else {}
    body = {"error": {"message": message, "type": "tokens", "code": "rate_limit_exceeded"}}
    return httpx.Response(429, headers=headers, json=body)


def sse(*deltas: str, usage: int | None = 42, done: bool = True) -> bytes:
    frames: list[dict[str, object]] = [{"choices": [{"index": 0, "delta": {"role": "assistant"}}]}]
    frames += [{"choices": [{"index": 0, "delta": {"content": d}}]} for d in deltas]
    if usage is not None:
        frames.append({"choices": [], "x_groq": {"usage": {"total_tokens": usage}}})
    text = "".join(f"data: {json.dumps(f)}\n\n" for f in frames)
    return (text + ("data: [DONE]\n\n" if done else "")).encode()


def sent(route: respx.Route, call: int = -1) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(route.calls[call].request.content)
    return body


# ---------------------------------------------------------------- requests


@pytest.mark.parametrize(
    ("role", "model", "temperature", "max_tokens", "effort", "json_mode"),
    [
        # docs/agent-spec.md §7, row by row.
        ("router", "openai/gpt-oss-20b", 0, 400, "low", True),
        ("compose", "openai/gpt-oss-120b", 0.4, 3000, "medium", True),
        ("nutrition", "openai/gpt-oss-20b", 0, 600, "low", True),
        ("respond", "openai/gpt-oss-20b", 0.7, 3000, "low", False),
        ("enrich", "openai/gpt-oss-20b", 0.3, 2000, "low", True),
    ],
)
async def test_each_role_sends_its_row_of_the_model_table(
    groq: respx.MockRouter,
    role: ModelRole,
    model: str,
    temperature: float,
    max_tokens: int,
    effort: str,
    json_mode: bool,
) -> None:
    route = groq.post("/chat/completions").mock(return_value=completion())

    await Harness().models.model_for(role).complete(PROMPT)

    body = sent(route)
    assert body["model"] == model
    assert body["temperature"] == temperature
    assert body["top_p"] == 0.9
    assert body["max_completion_tokens"] == max_tokens
    assert body["reasoning_effort"] == effort
    assert ("response_format" in body) is json_mode
    if json_mode:
        assert body["response_format"] == {"type": "json_object"}
    assert body["messages"] == [
        {"role": "system", "content": "Allergies: peanut"},
        {"role": "user", "content": "dinner ideas?"},
    ]


async def test_the_key_is_a_bearer_token(groq: respx.MockRouter) -> None:
    route = groq.post("/chat/completions").mock(return_value=completion())

    await Harness().models.model_for("router").complete(PROMPT)

    assert route.calls.last.request.headers["authorization"] == f"Bearer {KEY}"


async def test_timeouts_come_from_settings(groq: respx.MockRouter) -> None:
    route = groq.post("/chat/completions").mock(return_value=completion())
    harness = Harness(groq_connect_timeout_seconds=2.0, groq_read_timeout_seconds=20.0)

    await harness.models.model_for("router").complete(PROMPT)

    assert route.calls.last.request.extensions["timeout"] == {
        "connect": 2.0,
        "read": 20.0,
        "write": 2.0,
        "pool": 2.0,
    }


async def test_a_model_override_replaces_the_table(groq: respx.MockRouter) -> None:
    route = groq.post("/chat/completions").mock(return_value=completion(model="llama-x"))

    model = Harness().models.model_for("compose", model="llama-x")
    reply = await model.complete(PROMPT)

    assert model.model_id == "llama-x"
    assert sent(route)["model"] == "llama-x"
    assert reply.model == "llama-x"


async def test_complete_returns_text_model_and_tokens(groq: respx.MockRouter) -> None:
    groq.post("/chat/completions").mock(return_value=completion("Try the curry."))

    reply = await Harness().models.model_for("respond").complete(PROMPT)

    assert (reply.text, reply.model, reply.tokens_used) == (
        "Try the curry.",
        "openai/gpt-oss-20b",
        42,
    )


# ---------------------------------------------------------------- retries


async def test_a_429_is_retried_after_exactly_its_retry_after(groq: respx.MockRouter) -> None:
    route = groq.post("/chat/completions").mock(side_effect=[rate_limited(), completion()])
    harness = Harness()

    reply = await harness.models.model_for("router").complete(PROMPT)

    assert reply.text == "Try the curry."
    assert route.call_count == 2
    assert harness.sleeps == [3.0]


async def test_retry_after_can_be_an_http_date(groq: respx.MockRouter) -> None:
    groq.post("/chat/completions").mock(
        side_effect=[rate_limited(retry_after="Wed, 21 Oct 2015 07:28:00 GMT"), completion()]
    )
    harness = Harness()

    await harness.models.model_for("router").complete(PROMPT)

    # A date already past means "now", not a negative wait.
    assert harness.sleeps == [0.0]


async def test_without_a_header_the_wait_comes_from_groqs_message(groq: respx.MockRouter) -> None:
    groq.post("/chat/completions").mock(
        side_effect=[rate_limited("Please try again in 1.5s.", retry_after=None), completion()]
    )
    harness = Harness()

    await harness.models.model_for("router").complete(PROMPT)

    assert harness.sleeps == [1.5]


async def test_a_persistent_429_becomes_rate_limited_after_the_last_attempt(
    groq: respx.MockRouter,
) -> None:
    route = groq.post("/chat/completions").mock(return_value=rate_limited())
    harness = Harness(groq_max_attempts=3)

    with pytest.raises(RateLimited) as error:
        await harness.models.model_for("router").complete(PROMPT)

    assert route.call_count == 3
    assert harness.sleeps == [3.0, 3.0]
    assert str(error.value) == "Petra is at its rate limit. Try again in about 3 seconds."
    assert error.value.retry_after_s == 3.0
    assert not error.value.daily


async def test_a_long_retry_after_is_reported_not_waited_for(groq: respx.MockRouter) -> None:
    route = groq.post("/chat/completions").mock(
        return_value=rate_limited("Please try again in 1m2.5s.", retry_after=None)
    )
    harness = Harness()

    with pytest.raises(RateLimited) as error:
        await harness.models.model_for("router").complete(PROMPT)

    assert route.call_count == 1
    assert harness.sleeps == []
    assert error.value.retry_after_s == 62.5
    assert "about 63 seconds" in str(error.value)


async def test_a_daily_limit_is_reported_and_never_retried(groq: respx.MockRouter) -> None:
    route = groq.post("/chat/completions").mock(
        return_value=rate_limited("Limit reached on tokens per day (TPD). Please try again in 7m.")
    )

    with pytest.raises(RateLimited) as error:
        await Harness().models.model_for("compose").complete(PROMPT)

    assert route.call_count == 1
    assert error.value.daily
    assert str(error.value) == (
        "Petra has reached today's AI usage limit. It resets at midnight UTC."
    )


async def test_a_429_with_no_wait_named_says_about_two_seconds(groq: respx.MockRouter) -> None:
    groq.post("/chat/completions").mock(return_value=rate_limited("Slow down.", retry_after=None))

    with pytest.raises(RateLimited) as error:
        await Harness(groq_max_attempts=1).models.model_for("router").complete(PROMPT)

    assert str(error.value) == "Petra is at its rate limit. Try again in about 2 seconds."


@pytest.mark.parametrize("status", [502, 503])
async def test_an_edge_refusal_is_retried_with_a_short_backoff(
    groq: respx.MockRouter, status: int
) -> None:
    route = groq.post("/chat/completions").mock(side_effect=[httpx.Response(status), completion()])
    harness = Harness()

    await harness.models.model_for("router").complete(PROMPT)

    assert route.call_count == 2
    assert len(harness.sleeps) == 1 and 0 < harness.sleeps[0] <= 2.0


async def test_a_connect_failure_is_retried(groq: respx.MockRouter) -> None:
    route = groq.post("/chat/completions").mock(
        side_effect=[httpx.ConnectError("refused"), completion()]
    )

    await Harness().models.model_for("router").complete(PROMPT)

    assert route.call_count == 2


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ReadTimeout("no reply"),
        httpx.RemoteProtocolError("dropped"),
        httpx.Response(500),
        httpx.Response(504),
        httpx.Response(400, json={"error": {"code": "json_validate_failed"}}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"choices": []}),
    ],
)
async def test_a_call_that_may_have_been_billed_is_never_retried(
    groq: respx.MockRouter, failure: Exception | httpx.Response
) -> None:
    route = groq.post("/chat/completions").mock(side_effect=[failure, completion()])

    with pytest.raises(ProviderUnavailable) as error:
        await Harness().models.model_for("compose").complete(PROMPT)

    assert route.call_count == 1
    assert str(error.value) == "AI service is currently unavailable"


@pytest.mark.parametrize("status", [401, 403])
async def test_a_rejected_key_is_unavailable_and_logged_without_the_key(
    groq: respx.MockRouter, status: int
) -> None:
    groq.post("/chat/completions").mock(return_value=httpx.Response(status))

    with structlog.testing.capture_logs() as logs, pytest.raises(ProviderUnavailable):
        await Harness().models.model_for("router").complete(PROMPT)

    assert any(e["log_level"] == "error" and e["status"] == status for e in logs)
    assert KEY not in repr(logs)


async def test_logs_never_carry_the_prompt_or_groqs_message(groq: respx.MockRouter) -> None:
    groq.post("/chat/completions").mock(
        side_effect=[rate_limited("org_secret123 try again in 1s"), httpx.Response(500)]
    )

    with structlog.testing.capture_logs() as logs, pytest.raises(ProviderUnavailable):
        await Harness().models.model_for("router").complete(PROMPT)

    assert logs
    for leak in ("peanut", "dinner", "org_secret123", KEY):
        assert leak not in repr(logs)


# ---------------------------------------------------------------- streaming


async def test_stream_forwards_deltas_in_order_and_returns_the_whole_reply(
    groq: respx.MockRouter,
) -> None:
    route = groq.post("/chat/completions").mock(
        return_value=httpx.Response(200, content=sse("Try ", "the ", "curry."))
    )
    seen: list[str] = []

    reply = await Harness().models.model_for("respond").stream(PROMPT, seen.append)

    assert seen == ["Try ", "the ", "curry."]
    assert (reply.text, reply.tokens_used) == ("Try the curry.", 42)
    assert sent(route)["stream"] is True


async def test_a_refused_stream_is_retried_before_anything_is_forwarded(
    groq: respx.MockRouter,
) -> None:
    route = groq.post("/chat/completions").mock(
        side_effect=[rate_limited(retry_after="1"), httpx.Response(200, content=sse("ok"))]
    )
    seen: list[str] = []

    await Harness().models.model_for("respond").stream(PROMPT, seen.append)

    assert route.call_count == 2
    assert seen == ["ok"]


class Broken(httpx.AsyncByteStream):
    """Two deltas, then the connection drops."""

    async def __aiter__(self) -> AsyncIterator[bytes]:
        yield sse("Try ", "the ", usage=None, done=False)
        raise httpx.ReadError("connection reset")


async def test_a_stream_that_breaks_after_forwarding_is_not_retried(
    groq: respx.MockRouter,
) -> None:
    # Restarting would send "Try the " twice (KI-36).
    route = groq.post("/chat/completions").mock(
        side_effect=[httpx.Response(200, stream=Broken()), httpx.Response(200, content=sse("x"))]
    )
    seen: list[str] = []

    with pytest.raises(ProviderUnavailable):
        await Harness().models.model_for("respond").stream(PROMPT, seen.append)

    assert route.call_count == 1
    assert seen == ["Try ", "the "]


async def test_a_stream_cut_off_before_done_is_a_failure_not_a_short_reply(
    groq: respx.MockRouter,
) -> None:
    groq.post("/chat/completions").mock(
        return_value=httpx.Response(200, content=sse("Try ", usage=None, done=False))
    )

    with pytest.raises(ProviderUnavailable):
        await Harness().models.model_for("respond").stream(PROMPT, lambda _: None)


class Endless(httpx.AsyncByteStream):
    def __init__(self) -> None:
        self.closed = False

    async def __aiter__(self) -> AsyncIterator[bytes]:
        while True:
            yield sse("more ", usage=None, done=False)
            await asyncio.sleep(0)

    async def aclose(self) -> None:
        self.closed = True


async def test_a_cancelled_stream_raises_and_closes_the_connection(
    groq: respx.MockRouter,
) -> None:
    body = Endless()
    groq.post("/chat/completions").mock(return_value=httpx.Response(200, stream=body))
    seen: list[str] = []
    streaming = asyncio.Event()

    def forward(delta: str) -> None:
        seen.append(delta)
        if len(seen) == 3:
            streaming.set()

    task = asyncio.create_task(Harness().models.model_for("respond").stream(PROMPT, forward))
    await streaming.wait()

    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert body.closed
