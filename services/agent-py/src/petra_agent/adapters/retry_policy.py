"""When a model call may be retried: only when the provider provably did no work.

A generation is the expensive, budgeted thing (KI-20), so the rule is not
"retry what might succeed" but "retry what cannot have been billed":

- the request never reached the provider (connect or pool errors);
- the provider refused it outright: 429 with a short Retry-After, or a 502/503
  from its edge.

A read timeout, a dropped connection, a 500 or a 504 may each arrive after the
completion was generated, so none is retried. Nor is a daily limit, or a
Retry-After longer than a chat turn can afford to wait.

Streams get one more rule, enforced by the adapter's structure rather than
here: nothing is retried once a delta has been forwarded (KI-36).
"""

import random

import httpx

# Longer than this and the user is better served by "try again in N seconds"
# than by a turn that sits silent.
MAX_RETRY_AFTER_S = 10.0
# Jittered exponential backoff, for refusals that name no wait. Not quite "full"
# jitter: the wait never drops below a tenth of the ceiling, so it is never ~0.
BACKOFF_BASE_S = 0.25
BACKOFF_CAP_S = 2.0

RETRYABLE_STATUS = frozenset({429, 502, 503})
_NEVER_REACHED = (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout)


class UpstreamError(Exception):
    """A provider's HTTP error, before the adapter maps it to a ProviderError."""

    def __init__(
        self,
        status: int,
        *,
        retry_after_s: float | None = None,
        daily: bool = False,
        code: str | None = None,
    ) -> None:
        super().__init__(f"upstream returned {status}")
        self.status = status
        self.retry_after_s = retry_after_s
        self.daily = daily
        self.code = code


def should_retry(error: BaseException) -> bool:
    if isinstance(error, _NEVER_REACHED):
        return True
    if not isinstance(error, UpstreamError) or error.status not in RETRYABLE_STATUS:
        return False
    if error.daily:
        return False
    return error.retry_after_s is None or error.retry_after_s <= MAX_RETRY_AFTER_S


def backoff_seconds(error: BaseException, *, attempt: int) -> float:
    """How long to wait before attempt ``attempt + 1``."""
    if isinstance(error, UpstreamError) and error.retry_after_s is not None:
        return error.retry_after_s
    ceiling = min(BACKOFF_CAP_S, BACKOFF_BASE_S * 2 ** (attempt - 1))
    return random.uniform(ceiling / 10, ceiling)
