"""Connections shared by every request, opened once by the app's lifespan.

The database pool connects eagerly, so an unreachable database fails boot
rather than the first request. Redis is optional and lazy: a cache that cannot
connect costs latency, never a turn.
"""

from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from typing import Protocol

import asyncpg
import httpx
from redis.asyncio import Redis

from petra_agent.settings import Settings

# Open Food Facts asks every client to identify itself; the rest don't mind.
USER_AGENT = "Petra-AI/1.0 (contact@petra-ai.com)"


class Database(Protocol):
    async def ping(self) -> None:
        """Raise if the database cannot answer."""
        ...


@dataclass(frozen=True, slots=True)
class Clients:
    # Outbound HTTP for every vendor; adapters set per-call timeouts.
    http: httpx.AsyncClient
    database: Database
    redis: Redis | None


class PostgresDatabase:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def ping(self) -> None:
        await self.pool.fetchval("SELECT 1")


ClientsFactory = Callable[[Settings], AbstractAsyncContextManager[Clients]]


@asynccontextmanager
async def open_clients(settings: Settings) -> AsyncIterator[Clients]:
    pool = await asyncpg.create_pool(
        settings.database_url.get_secret_value(), min_size=1, max_size=10, command_timeout=10
    )
    redis = (
        Redis.from_url(
            settings.redis_url.get_secret_value(), socket_connect_timeout=2, socket_timeout=2
        )
        if settings.redis_url is not None
        else None
    )
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=5.0), headers={"User-Agent": USER_AGENT}
        ) as http:
            yield Clients(http=http, database=PostgresDatabase(pool), redis=redis)
    finally:
        if redis is not None:
            await redis.aclose()
        await pool.close()
