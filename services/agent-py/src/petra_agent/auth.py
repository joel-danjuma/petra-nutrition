"""The agent's only authentication: the shared key the API presents on every /v1 call.

The agent never sees a JWT. User identity arrives in the body, asserted by a
gateway that already authenticated the user; the key authenticates the gateway.
"""

import hmac

from fastapi import Request

from petra_agent.errors import AgentError
from petra_agent.log import get_logger
from petra_agent.runtime import runtime

# AGENT_INTERNAL_KEY_HEADER in @petra/agent-contract.
HEADER = "x-internal-key"

log = get_logger(__name__)


async def require_internal_key(request: Request) -> None:
    settings = runtime(request).settings
    if settings.auth_disabled:
        return

    presented = request.headers.get(HEADER)
    expected = settings.internal_api_key
    # Bytes, not str: compare_digest refuses non-ASCII str, and Starlette decoded
    # the header as latin-1, so encoding back recovers exactly what was sent.
    if (
        presented is None
        or expected is None
        or not hmac.compare_digest(
            presented.encode("latin-1"), expected.get_secret_value().encode()
        )
    ):
        log.warning(
            "rejected agent call with a bad internal key",
            path=request.url.path,
            ip=request.client.host if request.client else None,
        )
        raise AgentError(401, "INTERNAL_AUTH_FAILED", "This service is not directly reachable")
