"""Every route the API calls, driven with fixtures built from the contract models, and every
response checked against packages/agent-contract/contract.schema.json: the JSON Schema zod
exports, so the check is against the TypeScript side's own definition, not ours.

A ratchet. Each route is either IMPLEMENTED, and its response must validate against its
schema definition, or a stub that must still answer 501. Implementing a stub fails
test_stubs_are_still_stubs until the route joins IMPLEMENTED, so no handler can ship
without its response being checked.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft7Validator
from pydantic import BaseModel

from harness import AUTHED, app_with, serve
from petra_agent import contract

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "packages/agent-contract/contract.schema.json"
SCHEMA: dict[str, Any] = json.loads(SCHEMA_PATH.read_text())


def violations(definition: str, instance: object) -> list[str]:
    """Every way ``instance`` breaks ``#/definitions/<definition>``, readably."""
    validator = Draft7Validator(
        {"definitions": SCHEMA["definitions"], "$ref": f"#/definitions/{definition}"}
    )
    return [
        f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
        for e in validator.iter_errors(instance)
    ]


def sse_frames(text: str) -> list[dict[str, Any]]:
    """``event:``/``data:`` blocks as ``{event, data}``, the shape StreamEvent describes."""
    frames = []
    for block in text.split("\n\n"):
        fields = dict(
            line.split(": ", 1) for line in block.splitlines() if not line.startswith(":")
        )
        if "event" in fields:
            frames.append({"event": fields["event"], "data": json.loads(fields["data"])})
    return frames


# ---------------------------------------------------------------- fixtures

CHAT = contract.ChatRequest(
    messages=[contract.ChatMessage(role=contract.ChatRole.user, content="dinner ideas?")],
    user=contract.AgentUser(id="u1", subscriptionTier=contract.SubscriptionTier.PREMIUM),
    context=contract.AgentContext(allergies=["peanut"], pantryNames=["rice", "leek"]),
    options=contract.Options(maxRetrieved=6, threadId="session-1"),
)


@dataclass(frozen=True)
class Route:
    method: str
    path: str
    # The schema definition each side of the exchange must satisfy.
    request: str | None
    fixture: BaseModel | None
    response: str
    # /v1 JSON routes wrap their payload in { success, data }; /health doesn't.
    envelope: bool = True
    stream: bool = False

    @property
    def body(self) -> dict[str, Any] | None:
        # exclude_none: zod's .optional() rejects null, so an unset field must be absent.
        return (
            None
            if self.fixture is None
            else self.fixture.model_dump(mode="json", exclude_none=True)
        )


ROUTES = [
    Route("GET", "/health", None, None, "AgentHealth", envelope=False),
    Route("POST", "/v1/chat", "ChatRequest", CHAT, "ChatResponse"),
    Route("POST", "/v1/chat/stream", "ChatRequest", CHAT, "StreamEvent", stream=True),
    Route(
        "POST",
        "/v1/recipes/retrieve",
        "RetrieveRequest",
        contract.RetrieveRequest(query="curry", pantry=["rice"], allergies=["peanut"], limit=6),
        "RetrieveResponse",
    ),
    Route(
        "POST",
        "/v1/recipes/enrich",
        "EnrichRecipeRequest",
        contract.EnrichRecipeRequest(
            title="Leek soup",
            servings=2,
            ingredients=[contract.Ingredient(name="leek", amount=2, unit="")],
            instructions=[contract.Instruction(step=1, instruction="Simmer the leeks.")],
        ),
        "EnrichRecipeResponse",
    ),
    Route(
        "POST",
        "/v1/vision/pantry-items",
        "VisionRequest",
        contract.VisionRequest(image="aGk=", context="fresh_produce"),
        "DetectedPantryItem",
    ),
    Route(
        "POST",
        "/v1/vision/receipt",
        "ReceiptRequest",
        contract.ReceiptRequest(image="aGk="),
        "ReceiptResponse",
    ),
    Route(
        "POST",
        "/v1/index/rebuild",
        "IndexRebuildRequest",
        contract.IndexRebuildRequest(recipeIds=["r1"]),
        "IndexRebuildResponse",
    ),
]

# Move a path here when its handler lands; its response is then held to the schema.
IMPLEMENTED = {"/health"}

WITH_BODY = [r for r in ROUTES if r.request is not None]


def ids(route: Route) -> str:
    return route.path


# ---------------------------------------------------------------- the checker itself


def test_the_checker_catches_a_contract_violation() -> None:
    healthy = {
        "status": "healthy",
        "uptime": 1.0,
        "checks": {"database": "up", "llm": "configured", "embeddings": "ready"},
    }

    assert violations("AgentHealth", healthy) == []
    assert violations("AgentHealth", {**healthy, "status": "fine"})
    assert violations("AgentHealth", {"status": "healthy", "uptime": 1.0})


def test_stream_frames_are_checked_one_by_one() -> None:
    stream = (
        'event: node\ndata: {"node": "search", "label": "Searching"}\n\n'
        ": ping\n\n"
        'event: done\ndata: {"content": "ok", "type": "text"}\n\n'
    )

    frames = sse_frames(stream)

    assert [f["event"] for f in frames] == ["node", "done"]
    assert all(violations("StreamEvent", f) == [] for f in frames)
    assert violations("StreamEvent", {"event": "done", "data": {"content": "ok"}})


# ---------------------------------------------------------------- fixtures and routes


@pytest.mark.parametrize("route", WITH_BODY, ids=ids)
def test_every_fixture_is_a_valid_contract_request(route: Route) -> None:
    assert route.request is not None
    assert violations(route.request, route.body) == []


def test_the_table_covers_every_route_the_app_serves() -> None:
    # From the OpenAPI document: FastAPI keeps included routers private in app.routes.
    paths = app_with().openapi()["paths"]
    served = {(method.upper(), path) for path, ops in paths.items() for method in ops}

    assert served == {(r.method, r.path) for r in ROUTES}


@pytest.mark.parametrize("route", [r for r in ROUTES if r.path in IMPLEMENTED], ids=ids)
async def test_implemented_routes_answer_in_their_contract_shape(route: Route) -> None:
    async with serve(app_with()) as agent:
        response = await agent.request(route.method, route.path, json=route.body, headers=AUTHED)

    assert response.is_success, response.text
    if route.stream:
        for frame in sse_frames(response.text):
            assert violations(route.response, frame) == []
        return
    payload = response.json()
    if route.envelope:
        assert payload["success"] is True
        payload = payload["data"]
    assert violations(route.response, payload) == []


@pytest.mark.parametrize("route", [r for r in ROUTES if r.path not in IMPLEMENTED], ids=ids)
async def test_stubs_are_still_stubs(route: Route) -> None:
    async with serve(app_with()) as agent:
        response = await agent.request(route.method, route.path, json=route.body, headers=AUTHED)

    assert response.status_code == 501, (
        f"{route.path} is implemented now: add it to IMPLEMENTED so its response is "
        f"checked against #/definitions/{route.response}"
    )
    assert response.json()["error"]["code"] == "NOT_IMPLEMENTED"


# ---------------------------------------------------------------- unknown fields


@pytest.mark.parametrize("route", WITH_BODY, ids=ids)
async def test_a_request_with_an_unknown_field_is_rejected(route: Route) -> None:
    assert route.body is not None
    async with serve(app_with()) as agent:
        response = await agent.request(
            route.method, route.path, json={**route.body, "unexpected": 1}, headers=AUTHED
        )

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert "unexpected" in error["details"]["fieldErrors"]


async def test_an_unknown_field_deep_in_the_context_is_rejected_too() -> None:
    body = CHAT.model_dump(mode="json", exclude_none=True)
    body["context"]["allergyNotes"] = "anaphylactic"
    async with serve(app_with()) as agent:
        response = await agent.post("/v1/chat", json=body, headers=AUTHED)

    assert response.status_code == 400
    assert "context" in response.json()["error"]["details"]["fieldErrors"]
    # Validation details never echo the input (see test_app.py).
    assert "anaphylactic" not in response.text
