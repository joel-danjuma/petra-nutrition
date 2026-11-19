"""Per-request context: a request id, one access line, and the last-resort 500.

The id goes on every response and on every log line written during the request.

Pure ASGI rather than ``BaseHTTPMiddleware``, which buffers responses and
would hold back /v1/chat/stream's frames.

The access line names method, path, status and duration. It never names the
body, the query string or a header: bodies carry allergies and chat text, and
headers carry the internal key.
"""

import re
import time
import traceback
from uuid import uuid4

import structlog
from fastapi import Request
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from petra_agent.errors import error_response
from petra_agent.log import get_logger

HEADER = "x-request-id"
# Accept the API's id so one request reads as one story across both services,
# but only one that is safe to echo into a header and a log line.
_VALID_ID = re.compile(r"[A-Za-z0-9._:-]{1,128}")

log = get_logger(__name__)


def _request_id(scope: Scope) -> str:
    incoming = Headers(scope=scope).get(HEADER)
    if incoming is not None and _VALID_ID.fullmatch(incoming):
        return incoming
    return uuid4().hex


class RequestContext:
    def __init__(self, app: ASGIApp, *, development: bool) -> None:
        self.app = app
        self.development = development

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _request_id(scope)
        # Request.state reads this dict, so error handlers can quote the id.
        scope.setdefault("state", {})["request_id"] = request_id
        status = 500
        started = False

        async def send_with_id(message: Message) -> None:
            nonlocal status, started
            if message["type"] == "http.response.start":
                started = True
                status = message["status"]
                MutableHeaders(scope=message).append("X-Request-ID", request_id)
            await send(message)

        began = time.perf_counter()
        with structlog.contextvars.bound_contextvars(request_id=request_id):
            try:
                await self.app(scope, receive, send_with_id)
            except Exception:
                log.error("unhandled error", exc_info=True)
                if started:
                    raise
                response = error_response(
                    Request(scope),
                    500,
                    "INTERNAL_ERROR",
                    "Internal server error",
                    stack=traceback.format_exc() if self.development else None,
                )
                await response(scope, receive, send_with_id)
            finally:
                log.info(
                    "request",
                    method=scope["method"],
                    path=scope["path"],
                    status=status,
                    duration_ms=round((time.perf_counter() - began) * 1000, 1),
                )
