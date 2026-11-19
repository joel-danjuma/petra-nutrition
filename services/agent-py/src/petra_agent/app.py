"""The app factory: one place that turns Settings into a running service."""

import asyncio
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from petra_agent import health, routes
from petra_agent.clients import ClientsFactory, open_clients
from petra_agent.contract import Embeddings
from petra_agent.errors import install_error_handlers
from petra_agent.log import configure_logging, get_logger
from petra_agent.middleware import RequestContext
from petra_agent.ports import Embedder
from petra_agent.runtime import Runtime
from petra_agent.settings import Settings

log = get_logger(__name__)


async def _warm_up(embedder: Embedder, current: Runtime) -> None:
    """In the background, so boot never waits on a model load. Failure only degrades retrieval."""
    try:
        await embedder.warm_up()
    except Exception:
        log.warning("embedding warm-up failed; retrieval runs without vectors", exc_info=True)
        current.embeddings = Embeddings.unavailable
    else:
        current.embeddings = Embeddings.ready


def create_app(
    settings: Settings,
    *,
    open_clients: ClientsFactory = open_clients,
    embedder: Embedder | None = None,
) -> FastAPI:
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        for warning in settings.warnings():
            log.warning(warning)

        async with open_clients(settings) as clients:
            current = Runtime(
                settings=settings,
                clients=clients,
                started=time.monotonic(),
                embeddings=Embeddings.unavailable if embedder is None else Embeddings.loading,
            )
            app.state.runtime = current
            warming = None if embedder is None else asyncio.create_task(_warm_up(embedder, current))
            log.info("agent started", node_env=settings.node_env, port=settings.port)
            try:
                yield
            finally:
                if warming is not None:
                    warming.cancel()
                    with suppress(asyncio.CancelledError):
                        await warming

    # No docs routes: the service is private, and the contract package is its schema.
    app = FastAPI(
        title="Petra agent", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None
    )
    app.add_middleware(RequestContext, development=settings.is_development)
    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(routes.router)
    return app
