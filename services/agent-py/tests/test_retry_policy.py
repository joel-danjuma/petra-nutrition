"""Retry only when the provider provably did no work, so a retry can never spend tokens twice."""

import asyncio

import httpx
import pytest

from petra_agent.adapters.retry_policy import (
    MAX_RETRY_AFTER_S,
    UpstreamError,
    backoff_seconds,
    should_retry,
)

REQUEST = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")


@pytest.mark.parametrize(
    "error",
    [
        httpx.ConnectError("refused", request=REQUEST),
        httpx.ConnectTimeout("slow handshake", request=REQUEST),
        httpx.PoolTimeout("no free connection", request=REQUEST),
    ],
)
def test_the_request_never_reached_the_provider_so_it_is_retried(error: Exception) -> None:
    assert should_retry(error)


@pytest.mark.parametrize(
    "error",
    [
        # The provider may already be generating: a retry would pay twice (KI-20).
        httpx.ReadTimeout("no reply", request=REQUEST),
        httpx.WriteTimeout("half sent", request=REQUEST),
        httpx.RemoteProtocolError("dropped mid-reply", request=REQUEST),
        asyncio.CancelledError(),
        ValueError("a bug"),
    ],
)
def test_anything_that_may_have_started_work_is_not_retried(error: BaseException) -> None:
    assert not should_retry(error)


@pytest.mark.parametrize("status", [429, 502, 503])
def test_refusals_before_generation_are_retried(status: int) -> None:
    assert should_retry(UpstreamError(status, retry_after_s=1.0))


@pytest.mark.parametrize("status", [400, 401, 403, 404, 413, 422, 500, 504])
def test_other_statuses_are_not_retried(status: int) -> None:
    # 500 and 504 can arrive after the completion was generated and billed.
    assert not should_retry(UpstreamError(status))


def test_a_daily_limit_is_never_retried() -> None:
    assert not should_retry(UpstreamError(429, retry_after_s=1.0, daily=True))


def test_a_rate_limit_longer_than_a_chat_turn_can_wait_is_not_retried() -> None:
    assert should_retry(UpstreamError(429, retry_after_s=MAX_RETRY_AFTER_S))
    assert not should_retry(UpstreamError(429, retry_after_s=MAX_RETRY_AFTER_S + 0.1))


def test_retry_after_is_honoured_exactly() -> None:
    assert backoff_seconds(UpstreamError(429, retry_after_s=3.5), attempt=1) == 3.5


@pytest.mark.parametrize("attempt", [1, 2, 3, 4])
def test_without_retry_after_the_backoff_is_short_jittered_and_bounded(attempt: int) -> None:
    waits = {backoff_seconds(UpstreamError(503), attempt=attempt) for _ in range(50)}

    assert all(0 < w <= 2.0 for w in waits)
    assert len(waits) > 1
