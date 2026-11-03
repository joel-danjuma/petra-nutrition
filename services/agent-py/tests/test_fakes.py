"""The fakes must honour the port contracts, or tests written against them prove nothing."""

import asyncio

import pytest

from fakes import (
    FakeCache,
    FakeChatModel,
    FakeEmbedder,
    FakeFoodDatabase,
    FakeModels,
    FakeRecipeStore,
    RecordingSink,
    StoredRecipe,
    ingredients,
)
from petra_agent.ports import CandidateFilter, ChatMessage, LookupFailed, RateLimited

HI = [ChatMessage("user", "hi")]


async def test_stream_forwards_deltas_and_returns_the_whole_reply() -> None:
    model = FakeChatModel("respond", ("Try the ", "[recipe:", "r1]"), tokens_per_call=7)
    seen: list[str] = []

    reply = await model.stream(HI, seen.append)

    assert seen == ["Try the ", "[recipe:", "r1]"]
    assert reply.text == "Try the [recipe:r1]"
    assert reply.tokens_used == 7


async def test_a_cancelled_stream_raises_rather_than_returning_partial_text() -> None:
    model = FakeChatModel("respond", "one two three four")
    seen: list[str] = []
    task = asyncio.create_task(model.stream(HI, seen.append))
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert 0 < len(seen) < 4


async def test_scripted_errors_raise_and_an_exhausted_script_fails_loudly() -> None:
    model = FakeChatModel("compose", RateLimited("busy", retry_after_s=2))

    with pytest.raises(RateLimited):
        await model.complete(HI)
    with pytest.raises(AssertionError):
        await model.complete(HI)


def test_an_unscripted_role_is_a_test_failure() -> None:
    models = FakeModels()
    models.script("router", "{}")

    with pytest.raises(AssertionError):
        models.model_for("respond")


async def test_cache_is_a_miss_when_expired_or_down_and_never_raises() -> None:
    cache = FakeCache()
    assert await cache.set("k", {"match": None}, ttl_s=10)
    assert await cache.get("k") == {"match": None}

    cache.advance(10)
    assert await cache.get("k") is None

    cache.down = True
    assert await cache.set("k", 1, ttl_s=10) is False
    assert await cache.get("k") is None


async def test_food_lookup_tells_no_such_food_from_could_not_ask() -> None:
    foods = FakeFoodDatabase({}, failing=["kale"])

    assert await foods.lookup("tofu") is None
    with pytest.raises(LookupFailed):
        await foods.lookup("Kale ")


async def test_the_candidate_filter_blocks_whole_words_and_is_recorded() -> None:
    store = FakeRecipeStore(
        [
            StoredRecipe("pine", "Pesto", ingredients("basil", "pine nuts")),
            StoredRecipe("squash", "Soup", ingredients("butternut squash")),
            StoredRecipe(
                "mine", "Private", ingredients("basil"), is_public=False, created_by_id="u1"
            ),
        ]
    )
    where = CandidateFilter(owner_id=None, blocked_terms=frozenset({"nut", "nuts"}))

    hits = await store.pantry_candidates([["basil"], ["squash"]], where, limit=10)

    assert [c.id for c in hits] == ["squash"]
    assert store.filters == [where]


async def test_owners_see_their_private_recipes() -> None:
    store = FakeRecipeStore(
        [StoredRecipe("mine", "Private", ingredients("basil"), is_public=False, created_by_id="u1")]
    )
    where = CandidateFilter(owner_id="u1", blocked_terms=frozenset())

    assert [c.id for c in await store.pantry_candidates([["basil"]], where, limit=10)] == ["mine"]


async def test_semantic_candidates_rank_by_similarity_for_the_asked_model_only() -> None:
    embedder = FakeEmbedder()
    store = FakeRecipeStore(
        [
            StoredRecipe("curry", "Chickpea curry", ingredients("chickpea")),
            StoredRecipe("cake", "Lemon cake", ingredients("lemon")),
        ]
    )
    for doc in await store.documents(["curry", "cake"]):
        [vector] = await embedder.embed([doc.title])
        await store.write_vector(doc.id, vector, embedder.model_id)
    [query] = await embedder.embed(["spicy chickpea curry"])
    where = CandidateFilter(owner_id=None, blocked_terms=frozenset())

    hits = await store.semantic_candidates(query, embedder.model_id, where, limit=10)

    assert hits[0].id == "curry"
    assert await store.semantic_candidates(query, "other-model", where, limit=10) == []


def test_recording_sink_keeps_the_frame_order() -> None:
    sink = RecordingSink()
    sink.node("router", "Thinking")
    sink.chunk("Hello ")
    sink.chunk("there")

    assert [e[0] for e in sink.events] == ["node", "chunk", "chunk"]
    assert sink.text == "Hello there"
