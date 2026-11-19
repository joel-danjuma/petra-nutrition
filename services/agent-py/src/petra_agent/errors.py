"""The error envelope, identical to @petra/service-kit's (docs/agent-spec.md §2):

    { success: false, error: { code, message, timestamp, path, requestId?, details? } }

plus ``stack`` in development. The API reads ``error.code`` and
``error.message`` from it, so both must stay stable.
"""

import math
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from petra_agent.ports import JsonValue, ProviderUnavailable, RateLimited


class AgentError(Exception):
    """An operational error: its status, code and message reach the caller as they are."""

    def __init__(self, status: int, code: str, message: str, *, details: JsonValue = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def _timestamp() -> str:
    # The same format as JavaScript's toISOString().
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def error_body(
    *,
    code: str,
    message: str,
    path: str,
    request_id: str | None,
    details: JsonValue = None,
    stack: str | None = None,
) -> dict[str, JsonValue]:
    error: dict[str, JsonValue] = {
        "code": code,
        "message": message,
        "timestamp": _timestamp(),
        "path": path,
    }
    if request_id is not None:
        error["requestId"] = request_id
    if details is not None:
        error["details"] = details
    if stack is not None:
        error["stack"] = stack
    return {"success": False, "error": error}


def error_response(
    request: Request,
    status: int,
    code: str,
    message: str,
    *,
    details: JsonValue = None,
    stack: str | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    request_id: str | None = getattr(request.state, "request_id", None)
    return JSONResponse(
        error_body(
            code=code,
            message=message,
            path=request.url.path,
            request_id=request_id,
            details=details,
            stack=stack,
        ),
        status_code=status,
        headers=headers,
    )


def _flatten(errors: Sequence[Any]) -> dict[str, JsonValue]:
    """zod's ``error.flatten()`` shape, so the API sees the details it always has.

    Messages only: pydantic's ``input`` would echo the body, allergies included.
    """
    form: list[JsonValue] = []
    fields: dict[str, list[JsonValue]] = {}
    for error in errors:
        location = [part for part in error["loc"] if part != "body"]
        if location and isinstance(location[0], str):
            fields.setdefault(location[0], []).append(error["msg"])
        else:
            form.append(error["msg"])
    return {"formErrors": form, "fieldErrors": dict(fields)}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AgentError)
    async def agent_error(request: Request, error: AgentError) -> JSONResponse:
        return error_response(
            request, error.status, error.code, error.message, details=error.details
        )

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error: RequestValidationError) -> JSONResponse:
        errors = error.errors()
        if any(e["type"] == "json_invalid" for e in errors):
            return error_response(request, 400, "INVALID_JSON", "Invalid JSON in request body")
        return error_response(
            request,
            400,
            "VALIDATION_ERROR",
            "Invalid agent request body",
            details=_flatten(errors),
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        # Express answers an unmatched method with a 404 too.
        if error.status_code in (404, 405):
            return error_response(
                request, 404, "RESOURCE_NOT_FOUND", f"Route {request.url.path} not found"
            )
        return error_response(request, error.status_code, "HTTP_ERROR", str(error.detail))

    # Provider messages are written for users (KI-18), so they are relayed as they are.
    @app.exception_handler(RateLimited)
    async def rate_limited(request: Request, error: RateLimited) -> JSONResponse:
        headers = (
            {"Retry-After": str(math.ceil(error.retry_after_s))}
            if error.retry_after_s is not None
            else None
        )
        return error_response(request, 429, "RATE_LIMITED", str(error), headers=headers)

    @app.exception_handler(ProviderUnavailable)
    async def provider_unavailable(request: Request, error: ProviderUnavailable) -> JSONResponse:
        return error_response(request, 503, "AI_UNAVAILABLE", str(error))
