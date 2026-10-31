"""The generated wire models must accept and reject what the zod contract does."""

import pytest
from pydantic import ValidationError

from petra_agent.contract import ChatRequest, StreamEvent, StreamEvent2, StreamEvent3


def test_zod_defaults_apply_when_fields_are_omitted() -> None:
    request = ChatRequest.model_validate(
        {"messages": [{"role": "user", "content": "hi"}], "user": {"id": "u1"}, "context": {}}
    )

    assert request.user.subscriptionTier == "FREE"
    assert request.context is not None
    assert request.context.allergies == []


def test_unknown_keys_are_stripped_not_rejected() -> None:
    request = ChatRequest.model_validate(
        {"messages": [{"role": "user", "content": "hi"}], "user": {"id": "u1"}, "extra": 1}
    )

    assert "extra" not in request.model_dump()


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
