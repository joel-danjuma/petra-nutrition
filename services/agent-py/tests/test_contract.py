"""The generated wire models must accept and reject what the zod contract does."""

import pytest
from pydantic import BaseModel, ValidationError

from petra_agent.contract import (
    ChatRequest,
    ChatResponse,
    EnrichRecipeRequest,
    IndexRebuildRequest,
    ReceiptRequest,
    RetrieveRequest,
    StreamEvent,
    StreamEvent2,
    StreamEvent3,
    VisionRequest,
)


def test_zod_defaults_apply_when_fields_are_omitted() -> None:
    request = ChatRequest.model_validate(
        {"messages": [{"role": "user", "content": "hi"}], "user": {"id": "u1"}, "context": {}}
    )

    assert request.user.subscriptionTier == "FREE"
    assert request.context is not None
    assert request.context.allergies == []


CHAT = {"messages": [{"role": "user", "content": "hi"}], "user": {"id": "u1"}}


@pytest.mark.parametrize(
    ("model", "body"),
    [
        (ChatRequest, {**CHAT, "extra": 1}),
        (ChatRequest, {**CHAT, "messages": [{"role": "user", "content": "hi", "extra": 1}]}),
        (ChatRequest, {**CHAT, "user": {"id": "u1", "extra": 1}}),
        (ChatRequest, {**CHAT, "context": {"allergies": ["peanut"], "extra": 1}}),
        (ChatRequest, {**CHAT, "options": {"threadId": "s1", "extra": 1}}),
        (RetrieveRequest, {"query": "curry", "extra": 1}),
        (
            EnrichRecipeRequest,
            {
                "title": "Soup",
                "servings": 2,
                "ingredients": [{"name": "leek", "amount": 2, "unit": "", "extra": 1}],
                "instructions": [],
            },
        ),
        (VisionRequest, {"image": "aGk=", "extra": 1}),
        (ReceiptRequest, {"image": "aGk=", "extra": 1}),
        (IndexRebuildRequest, {"recipeIds": [], "extra": 1}),
    ],
)
def test_requests_reject_unknown_keys_at_any_depth(model: type[BaseModel], body: object) -> None:
    # The request schemas are .strict() in zod: a field the agent doesn't know is a 400.
    with pytest.raises(ValidationError, match="extra"):
        model.model_validate(body)


def test_responses_still_strip_unknown_keys() -> None:
    # Responses stay lenient, so an older API can read a newer agent's reply.
    response = ChatResponse.model_validate({"content": "ok", "type": "text", "extra": 1})

    assert "extra" not in response.model_dump()


def test_defaulted_list_rejects_null_as_zod_does() -> None:
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(
            {
                "messages": [{"role": "user", "content": "hi"}],
                "user": {"id": "u1"},
                "context": {"allergies": None},
            }
        )


def test_a_turn_needs_at_least_one_message() -> None:
    with pytest.raises(ValidationError):
        ChatRequest.model_validate({"messages": [], "user": {"id": "u1"}})


def test_stream_events_resolve_by_event_name() -> None:
    node = StreamEvent.model_validate(
        {"event": "node", "data": {"node": "search", "label": "Searching"}}
    )
    done = StreamEvent.model_validate({"event": "done", "data": {"content": "ok", "type": "text"}})

    assert isinstance(node.root, StreamEvent3)
    assert isinstance(done.root, StreamEvent2)
