"""The app under test: fake clients, settings, and a running app to send requests to.

Shared by test_app.py and test_conformance.py.
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Any

import httpx
import structlog
from fastapi import FastAPI
from pydantic import SecretStr

from fakes import FakeEmbedder
from petra_agent.app import create_app
from petra_agent.clients import Clients
from petra_agent.settings import Settings

KEY = "internal-key"


def capture_logs() -> Any:
    # Keep merge_contextvars, so captured events carry the bound request id as real lines do.
    return structlog.testing.capture_logs(processors=[structlog.contextvars.merge_contextvars])


class FakeDatabase:
    def __init__(self, *, up: bool = True) -> None:
        self.up = up

    async def ping(self) -> None:
        if not self.up:
            raise ConnectionRefusedError("db down")


class GatedEmbedder(FakeEmbedder):
    """Stays loading until the test opens the gate."""

    def __init__(self) -> None:
        super().__init__()
        self.gate = asyncio.Event()

    async def warm_up(self) -> None:
        await self.gate.wait()
        await super().warm_up()


def settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "node_env": "test",
        "database_url": SecretStr("postgresql://agent:pw@db:5432/petra"),
        "groq_api_key": SecretStr("gsk_test"),
        "internal_api_key": SecretStr(KEY),
    }
    return Settings(_env_file=None, **{**values, **overrides})


def no_network(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"unit tests make no network calls: {request.method} {request.url.host}")


def clients_with(database: FakeDatabase) -> Any:
    @asynccontextmanager
    async def open_clients(_: Settings) -> AsyncIterator[Clients]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(no_network)) as http:
            yield Clients(http=http, database=database, redis=None)

    return open_clients


def app_with(
    *,
    database: FakeDatabase | None = None,
    embedder: FakeEmbedder | None = None,
    **overrides: Any,
) -> FastAPI:
    return create_app(
        settings(**overrides),
        open_clients=clients_with(database or FakeDatabase()),
        embedder=embedder,
    )


def serve(app: FastAPI) -> AbstractAsyncContextManager[httpx.AsyncClient]:
    @asynccontextmanager
    async def running() -> AsyncIterator[httpx.AsyncClient]:
        async with app.router.lifespan_context(app):
            # Let the background warm-up run before the first request.
            await asyncio.sleep(0)
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://agent") as client:
                yield client

    return running()


AUTHED = {"x-internal-key": KEY}
