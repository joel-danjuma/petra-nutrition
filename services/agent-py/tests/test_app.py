"""The app factory, driven through HTTP exactly as the API calls it."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Any

import httpx
import pytest
import structlog
from fastapi import FastAPI
from pydantic import SecretStr

from fakes import FakeEmbedder
from petra_agent.app import create_app
from petra_agent.clients import Clients
from petra_agent.contract import AgentHealth
from petra_agent.ports import ProviderUnavailable, RateLimited
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


# ---------------------------------------------------------------- health


async def test_health_is_healthy_when_every_dependency_is() -> None:
    async with serve(app_with(embedder=FakeEmbedder())) as agent:
        response = await agent.get("/health")

    assert response.status_code == 200
    health = AgentHealth.model_validate(response.json())
    assert health.status == "healthy"
    assert health.checks.model_dump(mode="json") == {
        "database": "up",
        "llm": "configured",
        "embeddings": "ready",
    }
    assert health.uptime >= 0


async def test_health_omits_absent_fields_rather_than_sending_null() -> None:
    # zod's .optional() rejects null, so the API would refuse recipesIndexed: null.
    async with serve(app_with(embedder=FakeEmbedder())) as agent:
        body = (await agent.get("/health")).json()

    assert None not in body.values()


async def test_health_is_degraded_but_200_while_embeddings_load() -> None:
    embedder = GatedEmbedder()
    async with serve(app_with(embedder=embedder)) as agent:
        loading = (await agent.get("/health")).json()
        embedder.gate.set()
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        ready = (await agent.get("/health")).json()

    assert (loading["status"], loading["checks"]["embeddings"]) == ("degraded", "loading")
    assert (ready["status"], ready["checks"]["embeddings"]) == ("healthy", "ready")


async def test_health_is_degraded_when_embeddings_are_unavailable() -> None:
    failing = FakeEmbedder()
    failing.fail = RuntimeError("no model")

    for embedder in (None, failing):
        async with serve(app_with(embedder=embedder)) as agent:
            response = await agent.get("/health")

        assert response.status_code == 200
        assert response.json()["status"] == "degraded"
        assert response.json()["checks"]["embeddings"] == "unavailable"


async def test_health_is_unhealthy_and_503_when_the_database_is_down() -> None:
    async with serve(app_with(database=FakeDatabase(up=False), embedder=FakeEmbedder())) as agent:
        response = await agent.get("/health")

    assert response.status_code == 503
    assert response.json()["status"] == "unhealthy"
    assert response.json()["checks"]["database"] == "down"


async def test_health_needs_no_internal_key() -> None:
    async with serve(app_with()) as agent:
        response = await agent.get("/health")

    assert response.status_code == 200


# ---------------------------------------------------------------- auth and routes

CHAT = {"messages": [{"role": "user", "content": "hi"}], "user": {"id": "u1"}}

# Every path the API's agent-client calls, with the smallest body the contract accepts.
ROUTES = [
    ("/v1/chat", CHAT),
    ("/v1/chat/stream", CHAT),
    ("/v1/recipes/retrieve", {}),
    ("/v1/recipes/enrich", {"title": "Soup", "servings": 2, "ingredients": [], "instructions": []}),
    ("/v1/vision/pantry-items", {"image": "aGk="}),
    ("/v1/vision/receipt", {"image": "aGk="}),
    ("/v1/index/rebuild", {}),
]

AUTHED = {"x-internal-key": KEY}


@pytest.mark.parametrize(("path", "body"), ROUTES)
async def test_every_api_path_exists_behind_auth(path: str, body: dict[str, Any]) -> None:
    async with serve(app_with()) as agent:
        response = await agent.post(path, json=body, headers=AUTHED)

    assert response.status_code == 501
    assert response.json()["error"]["code"] == "NOT_IMPLEMENTED"


async def test_index_rebuild_accepts_an_empty_body() -> None:
    async with serve(app_with()) as agent:
        response = await agent.post("/v1/index/rebuild", headers=AUTHED)

    assert response.status_code == 501


@pytest.mark.parametrize(
    "headers", [{}, {"x-internal-key": "wrong"}, {"x-internal-key": KEY + "x"}]
)
async def test_a_missing_or_wrong_key_is_refused(headers: dict[str, str]) -> None:
    async with serve(app_with()) as agent:
        response = await agent.post("/v1/chat", json=CHAT, headers=headers)

    assert response.status_code == 401
    error = response.json()["error"]
    assert response.json()["success"] is False
    assert error["code"] == "INTERNAL_AUTH_FAILED"
    assert error["message"] == "This service is not directly reachable"
    assert error["path"] == "/v1/chat"


async def test_a_non_ascii_key_is_refused_not_crashed_on() -> None:
    async with serve(app_with()) as agent:
        response = await agent.post(
            "/v1/chat", json=CHAT, headers=[(b"x-internal-key", b"\xff\xfe")]
        )

    assert response.status_code == 401


async def test_auth_is_checked_before_the_body() -> None:
    async with serve(app_with()) as agent:
        response = await agent.post("/v1/chat", json={"nonsense": True})

    assert response.status_code == 401


async def test_locally_without_a_key_auth_is_off() -> None:
    async with serve(app_with(internal_api_key=None)) as agent:
        response = await agent.post("/v1/chat", json=CHAT)

    assert response.status_code == 501


async def test_a_refused_key_is_logged_without_the_key() -> None:
    app = app_with()  # Before capturing: create_app configures logging.
    with capture_logs() as logs:
        async with serve(app) as agent:
            await agent.post("/v1/chat", json=CHAT, headers={"x-internal-key": "guess-123"})

    refused = [e for e in logs if e["event"] == "rejected agent call with a bad internal key"]
    assert refused and refused[0]["path"] == "/v1/chat"
    assert "guess-123" not in repr(logs)
    assert KEY not in repr(logs)


# ---------------------------------------------------------------- errors


def raising(error: BaseException, **overrides: Any) -> FastAPI:
    app = app_with(**overrides)

    @app.post("/v1/raise")
    async def raise_it() -> None:
        raise error

    return app


async def test_an_invalid_body_is_a_400_with_zod_shaped_details() -> None:
    body = {"messages": [], "user": {"id": ["peanut allergy"]}}
    async with serve(app_with()) as agent:
        response = await agent.post("/v1/chat", json=body, headers=AUTHED)

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["message"] == "Invalid agent request body"
    assert error["details"]["formErrors"] == []
    assert set(error["details"]["fieldErrors"]) == {"messages", "user"}


async def test_validation_details_never_echo_the_input() -> None:
    body = {"messages": [{"role": "chef", "content": "my peanut allergy"}], "user": {"id": 7}}
    async with serve(app_with()) as agent:
        response = await agent.post("/v1/chat", json=body, headers=AUTHED)

    assert response.status_code == 400
    assert "peanut" not in response.text
    assert "chef" not in response.text


async def test_a_body_that_is_not_an_object_is_a_form_error() -> None:
    async with serve(app_with()) as agent:
        response = await agent.post("/v1/chat", json=["hi"], headers=AUTHED)

    details = response.json()["error"]["details"]
    assert details["formErrors"] and details["fieldErrors"] == {}


async def test_malformed_json_is_invalid_json() -> None:
    async with serve(app_with()) as agent:
        response = await agent.post(
            "/v1/chat",
            content=b'{"messages": [',
            headers={**AUTHED, "content-type": "application/json"},
        )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_JSON"
    assert response.json()["error"]["message"] == "Invalid JSON in request body"


@pytest.mark.parametrize(("method", "path"), [("GET", "/nope"), ("GET", "/v1/chat")])
async def test_an_unknown_route_is_resource_not_found(method: str, path: str) -> None:
    async with serve(app_with()) as agent:
        response = await agent.request(method, path, headers=AUTHED)

    assert response.status_code == 404
    assert response.json()["error"] == {
        **response.json()["error"],
        "code": "RESOURCE_NOT_FOUND",
        "message": f"Route {path} not found",
        "path": path,
    }


async def test_a_rate_limit_reaches_the_caller_as_a_429_with_its_message() -> None:
    # KI-18: the TypeScript agent turned this into a generic 500.
    message = "Petra is at its rate limit. Try again in about 3 seconds."
    async with serve(raising(RateLimited(message, retry_after_s=3))) as agent:
        response = await agent.post("/v1/raise", headers=AUTHED)

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"
    assert response.json()["error"]["message"] == message
    assert response.headers["retry-after"] == "3"


async def test_an_unavailable_provider_is_a_503_with_its_message() -> None:
    async with serve(raising(ProviderUnavailable("AI service is currently unavailable"))) as agent:
        response = await agent.post("/v1/raise", headers=AUTHED)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_UNAVAILABLE"
    assert response.json()["error"]["message"] == "AI service is currently unavailable"


# ---------------------------------------------------------------- request context


async def test_every_response_carries_a_request_id_that_errors_quote() -> None:
    async with serve(app_with()) as agent:
        health = await agent.get("/health")
        refused = await agent.post("/v1/chat", json=CHAT)

    assert health.headers["x-request-id"]
    assert refused.headers["x-request-id"] != health.headers["x-request-id"]
    assert refused.json()["error"]["requestId"] == refused.headers["x-request-id"]


async def test_a_well_formed_incoming_request_id_is_kept() -> None:
    async with serve(app_with()) as agent:
        response = await agent.get("/health", headers={"x-request-id": "api-7f3a.2"})

    assert response.headers["x-request-id"] == "api-7f3a.2"


@pytest.mark.parametrize("incoming", ["x" * 129, "<script>", "a b"])
async def test_a_malformed_incoming_request_id_is_replaced(incoming: str) -> None:
    async with serve(app_with()) as agent:
        response = await agent.get("/health", headers={"x-request-id": incoming})

    assert response.headers["x-request-id"] != incoming


async def test_each_request_is_logged_once_without_its_body_or_headers() -> None:
    app = app_with()
    body = {**CHAT, "context": {"allergies": ["peanut-allergy-marker"]}}
    with capture_logs() as logs:
        async with serve(app) as agent:
            response = await agent.post("/v1/chat?q=query-marker", json=body, headers=AUTHED)

    [line] = [e for e in logs if e["event"] == "request"]
    assert line["method"] == "POST"
    assert line["path"] == "/v1/chat"
    assert line["status"] == 501
    assert line["request_id"] == response.headers["x-request-id"]
    assert line["duration_ms"] >= 0
    for secret in ("peanut-allergy-marker", "query-marker", KEY):
        assert secret not in repr(logs)


async def test_lines_logged_during_a_request_carry_its_id() -> None:
    app = app_with()
    with capture_logs() as logs:
        async with serve(app) as agent:
            response = await agent.post("/v1/chat", json=CHAT)

    [refusal] = [e for e in logs if e["event"].startswith("rejected")]
    assert refusal["request_id"] == response.headers["x-request-id"]


async def test_an_unhandled_error_is_a_500_that_hides_its_message() -> None:
    app = raising(RuntimeError("SELECT * FROM secrets"))
    with capture_logs() as logs:
        async with serve(app) as agent:
            response = await agent.post("/v1/raise", headers=AUTHED)

    assert response.status_code == 500
    error = response.json()["error"]
    assert (error["code"], error["message"]) == ("INTERNAL_ERROR", "Internal server error")
    assert error["requestId"] == response.headers["x-request-id"]
    assert "stack" not in error
    assert "SELECT" not in response.text
    assert any(e["event"] == "unhandled error" and e["log_level"] == "error" for e in logs)


async def test_development_adds_the_stack_to_a_500() -> None:
    async with serve(raising(RuntimeError("boom"), node_env="development")) as agent:
        response = await agent.post("/v1/raise", headers=AUTHED)

    assert "RuntimeError: boom" in response.json()["error"]["stack"]


# ---------------------------------------------------------------- lifespan


async def test_an_unreachable_database_refuses_to_boot() -> None:
    @asynccontextmanager
    async def unreachable(_: Settings) -> AsyncIterator[Clients]:
        raise ConnectionRefusedError("db down")
        yield  # pragma: no cover

    app = create_app(settings(), open_clients=unreachable)

    with pytest.raises(ConnectionRefusedError):
        async with app.router.lifespan_context(app):
            pass


async def test_boot_names_the_missing_optional_services() -> None:
    app = app_with()
    with capture_logs() as logs:
        async with serve(app):
            pass

    warnings = [e["event"] for e in logs if e["log_level"] == "warning"]
    assert any("REDIS_URL" in w for w in warnings)
    assert any("FDC_API_KEY" in w for w in warnings)
