"""GET /health: unauthenticated, so the container healthcheck and the API's boot probe reach it.

Unlike the TypeScript agent's, every check is live and the body is the
contract's ``AgentHealth`` (KI-33). The status code carries the verdict the API
acts on: 503 only when unhealthy, because the API treats any non-2xx as "agent
down" and a missing embedding model should not stop it booting.
"""

import asyncio
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from petra_agent import contract
from petra_agent.clients import Database
from petra_agent.log import get_logger
from petra_agent.runtime import runtime

PING_TIMEOUT_S = 1.0

log = get_logger(__name__)
router = APIRouter()


async def _reachable(database: Database) -> bool:
    try:
        await asyncio.wait_for(database.ping(), PING_TIMEOUT_S)
    except Exception as error:
        log.warning("health database ping failed", error=type(error).__name__)
        return False
    return True


@router.get("/health")
async def health(request: Request) -> JSONResponse:
    current = runtime(request)
    checks = contract.Checks(
        database=(
            contract.Database.up
            if await _reachable(current.clients.database)
            else contract.Database.down
        ),
        llm=(
            contract.Llm.configured
            if current.settings.groq_api_key.get_secret_value()
            else contract.Llm.missing
        ),
        embeddings=current.embeddings,
    )

    if checks.database is contract.Database.down:
        status = contract.Status.unhealthy
    elif checks.llm is contract.Llm.missing or checks.embeddings is not contract.Embeddings.ready:
        status = contract.Status.degraded
    else:
        status = contract.Status.healthy

    body = contract.AgentHealth(
        status=status, uptime=time.monotonic() - current.started, checks=checks
    )
    return JSONResponse(
        # zod's .optional() rejects null, so absent fields are left out.
        body.model_dump(mode="json", exclude_none=True),
        status_code=503 if status is contract.Status.unhealthy else 200,
    )
