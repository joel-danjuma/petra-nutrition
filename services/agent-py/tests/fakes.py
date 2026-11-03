"""In-memory stand-ins for every port in petra_agent.ports.

Each fake subclasses its Protocol, so mypy fails the build when a port changes
and its fake does not. They honour the port's contract (cancellation, "never
raises", JSON-only cache values) so a test that passes against a fake means
something against the real adapter. They never log.
"""

import asyncio
import hashlib
import json
import math
import re
from collections import deque
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field

from petra_agent.ports import (
    Cache,
    Candidate,
    CandidateFilter,
    ChatMessage,
    ChatModel,
    Completion,
    Embedder,
    EmbeddingIndex,
    FoodDatabase,
    FoodMatch,
    GraphNode,
    HydratedRecipe,
    Image,
    IngredientLine,
    JsonValue,
    LibraryRecipe,
    LookupFailed,
    ModelProvider,
    ModelRole,
    OverflowRecipe,
    OverflowSource,
    RecipeDocument,
    RecipeLibrary,
    SearchCapability,
    TurnSink,
    VisionModel,
    VisionTask,
)

# A reply is the whole text, explicit deltas (to split a marker mid-stream), or
# an exception to raise in its place.
Reply = str | tuple[str, ...] | BaseException

_WORDS = re.compile(r"\S+\s*|\s+")


def _deltas(reply: str | tuple[str, ...]) -> tuple[str, ...]:
    return reply if isinstance(reply, tuple) else tuple(_WORDS.findall(reply))


class _Script:
    """A queue of replies. Running out is a test failure, not a silent empty string."""

    def __init__(self, owner: str, replies: Iterable[Reply]) -> None:
        self._owner = owner
        self._replies: deque[Reply] = deque(replies)

    def push(self, *replies: Reply) -> None:
        self._replies.extend(replies)

    def next(self) -> str | tuple[str, ...]:
        if not self._replies:
            raise AssertionError(f"{self._owner} was called more times than it was scripted")
        reply = self._replies.popleft()
        if isinstance(reply, BaseException):
            raise reply
        return reply


# ---------------------------------------------------------------- models


class FakeChatModel(ChatModel):
    def __init__(
        self,
        role: ModelRole,
        *replies: Reply,
        model_id: str = "fake-model",
        tokens_per_call: int | None = None,
    ) -> None:
        self._role = role
        self._model_id = model_id
        self._tokens = tokens_per_call
        self._script = _Script(f"FakeChatModel({role!r})", replies)
        self.calls: list[list[ChatMessage]] = []

    @property
    def role(self) -> ModelRole:
        return self._role

    @property
    def model_id(self) -> str:
        return self._model_id

    def reply(self, *replies: Reply) -> "FakeChatModel":
        self._script.push(*replies)
        return self

    async def complete(self, messages: Sequence[ChatMessage]) -> Completion:
        self.calls.append(list(messages))
        await asyncio.sleep(0)
        return Completion("".join(_deltas(self._script.next())), self._model_id, self._tokens)

    async def stream(
        self, messages: Sequence[ChatMessage], on_delta: Callable[[str], None]
    ) -> Completion:
        self.calls.append(list(messages))
        deltas = _deltas(self._script.next())
        for delta in deltas:
            # A yield between deltas, so a cancelled turn stops mid-reply and raises.
            await asyncio.sleep(0)
            on_delta(delta)
        return Completion("".join(deltas), self._model_id, self._tokens)


class FakeModels(ModelProvider):
    """Asking for a role nobody scripted fails the test: no model call goes unfaked."""

    def __init__(self) -> None:
        self._models: dict[ModelRole, FakeChatModel] = {}
        self.overrides: list[tuple[ModelRole, str]] = []

    def script(
        self,
        role: ModelRole,
        *replies: Reply,
        model_id: str = "fake-model",
        tokens_per_call: int | None = None,
    ) -> FakeChatModel:
        model = FakeChatModel(role, *replies, model_id=model_id, tokens_per_call=tokens_per_call)
        self._models[role] = model
        return model

    def model_for(self, role: ModelRole, *, model: str | None = None) -> ChatModel:
        if model is not None:
            self.overrides.append((role, model))
        if role not in self._models:
            raise AssertionError(f"no fake model scripted for role {role!r}")
        return self._models[role]


class FakeVisionModel(VisionModel):
    def __init__(self, *replies: Reply, model_id: str = "fake-vision") -> None:
        self._model_id = model_id
        self._script = _Script("FakeVisionModel", replies)
        self.calls: list[tuple[VisionTask, Image, str]] = []

    async def read(self, task: VisionTask, image: Image, prompt: str) -> Completion:
        self.calls.append((task, image, prompt))
        await asyncio.sleep(0)
        return Completion("".join(_deltas(self._script.next())), self._model_id)


# ---------------------------------------------------------------- embeddings


class FakeEmbedder(Embedder):
    """Hashed bag of words: deterministic, and texts that share words land close together."""

    def __init__(self, *, dims: int = 384, model_id: str = "fake-minilm") -> None:
        self._dims = dims
        self._model_id = model_id
        self.fail: BaseException | None = None
        self.warmed = False
        self.calls: list[list[str]] = []

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def dims(self) -> int:
        return self._dims

    async def warm_up(self) -> None:
        if self.fail is not None:
            raise self.fail
        self.warmed = True

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        await asyncio.sleep(0)
        if self.fail is not None:
            raise self.fail
        return [self.vector(text) for text in texts]

    def vector(self, text: str) -> list[float]:
        vector = [0.0] * self._dims
        for word in re.findall(r"[a-z]+", text.lower()):
            digest = hashlib.blake2b(word.encode(), digest_size=4).digest()
            vector[int.from_bytes(digest) % self._dims] += 1.0
        norm = math.sqrt(sum(x * x for x in vector))
        return [x / norm for x in vector] if norm else vector


# ---------------------------------------------------------------- recipes


def ingredients(*names: str) -> tuple[IngredientLine, ...]:
    return tuple(IngredientLine(name, 1.0, "") for name in names)


@dataclass
class StoredRecipe:
    id: str
    title: str
    ingredients: tuple[IngredientLine, ...]
    servings: int = 2
    total_time: int = 30
    cuisine: str | None = None
    image_url: str | None = None
    description: str | None = None
    dietary_tags: tuple[str, ...] = ()
    tags: tuple[str, ...] = ()
    instructions: tuple[str, ...] = ()
    is_public: bool = True
    created_by_id: str | None = None
    rating: float = 0.0


def _has_word(term: str, text: str) -> bool:
    return re.search(rf"\b{re.escape(term)}\b", text, re.IGNORECASE) is not None


def _overlap(query: set[str], text: str | None) -> float:
    words = set(re.findall(r"[a-z]+", (text or "").lower()))
    return len(query & words) / len(query) if query else 0.0


@dataclass
class FakeRecipeStore(RecipeLibrary, EmbeddingIndex):
    """The recipe tables, both halves: what retrieval reads and what indexing writes.

    The candidate filter is applied the way the SQL applies it (whole-word,
    case-insensitive, title and ingredient names only), and every filter is
    recorded so a test can assert what core asked for rather than trusting this
    copy of the matching. Lexical scoring is word overlap, not trigrams.

    Name a method in ``fail`` to make it raise, as a broken signal would.
    A disabled extension raises too, as the missing operator would in Postgres.
    """

    recipes: list[StoredRecipe] = field(default_factory=list)
    lexical: bool = True
    vectors: bool = True
    fail: set[str] = field(default_factory=set)
    embeddings: dict[tuple[str, str], list[float]] = field(default_factory=dict)
    filters: list[CandidateFilter] = field(default_factory=list)

    def _check(self, method: str) -> None:
        if method in self.fail:
            raise RuntimeError(f"fake {method} failure")

    def _eligible(self, where: CandidateFilter) -> list[StoredRecipe]:
        self.filters.append(where)

        def visible(r: StoredRecipe) -> bool:
            return r.is_public or (where.owner_id is not None and r.created_by_id == where.owner_id)

        def safe(r: StoredRecipe) -> bool:
            texts = [r.title, *(i.name for i in r.ingredients)]
            return not any(_has_word(t, x) for t in where.blocked_terms for x in texts)

        return [r for r in self.recipes if visible(r) and safe(r)]

    @staticmethod
    def _ranked(scored: list[tuple[float, StoredRecipe]], limit: int) -> list[Candidate]:
        scored.sort(key=lambda pair: (-pair[0], -pair[1].rating))
        return [Candidate(r.id, rank) for rank, (_, r) in enumerate(scored[:limit])]

    def _get(self, recipe_id: str) -> StoredRecipe | None:
        return next((r for r in self.recipes if r.id == recipe_id), None)

    async def verify(self) -> int:
        self._check("verify")
        return sum(r.is_public for r in self.recipes)

    async def capability(self, model: str) -> SearchCapability:
        self._check("capability")
        embedded = sum(m == model for _, m in self.embeddings)
        return SearchCapability(self.lexical, self.vectors, embedded)

    async def pantry_candidates(
        self, pantry_terms: Sequence[Sequence[str]], where: CandidateFilter, limit: int
    ) -> list[Candidate]:
        self._check("pantry_candidates")
        scored: list[tuple[float, StoredRecipe]] = []
        for recipe in self._eligible(where):
            names = {i.name.lower() for i in recipe.ingredients}
            covered = [
                n for n in names if any(t and all(_has_word(w, n) for w in t) for t in pantry_terms)
            ]
            if covered:
                scored.append((len(covered) / len(names), recipe))
        return self._ranked(scored, limit)

    async def lexical_candidates(
        self, query: str, where: CandidateFilter, limit: int
    ) -> list[Candidate]:
        self._check("lexical_candidates")
        if not self.lexical:
            raise RuntimeError("operator does not exist: text %> text")
        words = {w for w in re.findall(r"[a-z]+", query.lower()) if len(w) > 2}
        scored: list[tuple[float, StoredRecipe]] = []
        for recipe in self._eligible(where):
            score = max(
                _overlap(words, recipe.title) * 2,
                max((_overlap(words, i.name) for i in recipe.ingredients), default=0.0),
                _overlap(words, recipe.cuisine) * 0.5,
            )
            if score > 0:
                scored.append((score, recipe))
        return self._ranked(scored, limit)

    async def semantic_candidates(
        self, vector: Sequence[float], model: str, where: CandidateFilter, limit: int
    ) -> list[Candidate]:
        self._check("semantic_candidates")
        if not self.vectors:
            raise RuntimeError("type vector does not exist")
        scored: list[tuple[float, StoredRecipe]] = []
        for recipe in self._eligible(where):
            stored = self.embeddings.get((recipe.id, model))
            if stored is not None:
                scored.append((sum(a * b for a, b in zip(stored, vector, strict=True)), recipe))
        return self._ranked(scored, limit)

    async def hydrate(self, ids: Sequence[str]) -> Mapping[str, HydratedRecipe]:
        self._check("hydrate")
        found = (r for r in map(self._get, ids) if r is not None)
        return {
            r.id: HydratedRecipe(
                id=r.id,
                title=r.title,
                image_url=r.image_url,
                cuisine=r.cuisine,
                total_time=r.total_time,
                servings=r.servings,
                dietary_tags=r.dietary_tags,
                ingredients=tuple(i.name for i in r.ingredients),
            )
            for r in found
        }

    async def library_recipe(self, recipe_id: str) -> LibraryRecipe | None:
        self._check("library_recipe")
        recipe = self._get(recipe_id)
        if recipe is None:
            return None
        return LibraryRecipe(recipe.id, recipe.servings, recipe.ingredients)

    async def documents(self, ids: Sequence[str]) -> list[RecipeDocument]:
        self._check("documents")
        return [
            RecipeDocument(
                id=r.id,
                title=r.title,
                description=r.description,
                cuisine=r.cuisine,
                tags=r.tags,
                ingredient_names=tuple(i.name for i in r.ingredients),
                instructions=r.instructions[:2],
            )
            for r in map(self._get, ids)
            if r is not None
        ]

    async def write_vector(self, recipe_id: str, vector: Sequence[float], model: str) -> None:
        self._check("write_vector")
        self.embeddings[(recipe_id, model)] = list(vector)


# ---------------------------------------------------------------- nutrition


class FakeFoodDatabase(FoodDatabase):
    """A fixture table. Names in ``failing`` raise ``LookupFailed``, as an unreachable API would."""

    def __init__(self, foods: Mapping[str, FoodMatch], *, failing: Iterable[str] = ()) -> None:
        self._foods = {name.lower(): match for name, match in foods.items()}
        self.failing = {name.lower() for name in failing}
        self.calls: list[str] = []

    async def lookup(self, ingredient_name: str) -> FoodMatch | None:
        self.calls.append(ingredient_name)
        key = ingredient_name.strip().lower()
        if key in self.failing:
            raise LookupFailed(f"fake lookup failure for {key!r}")
        return self._foods.get(key)


# ---------------------------------------------------------------- overflow


class FakeOverflow(OverflowSource):
    def __init__(self, *seeds: OverflowRecipe) -> None:
        self._seeds = list(seeds)
        self.queries: list[str] = []

    async def seeds(self, query: str, limit: int) -> list[OverflowRecipe]:
        self.queries.append(query)
        return self._seeds[:limit]


# ---------------------------------------------------------------- cache


class FakeCache(Cache):
    """Stores JSON text, as Redis does, so a value that would not survive the round trip fails.

    Time is manual: ``advance`` it to expire entries. Set ``down`` to behave
    like an unreachable Redis, which is a miss and a refused write, never an error.
    """

    def __init__(self) -> None:
        self.now = 0.0
        self.down = False
        self._entries: dict[str, tuple[str, float]] = {}
        self.ttls: dict[str, int] = {}

    def advance(self, seconds: float) -> None:
        self.now += seconds

    async def get(self, key: str) -> JsonValue:
        entry = None if self.down else self._entries.get(key)
        if entry is None or entry[1] <= self.now:
            return None
        loaded: JsonValue = json.loads(entry[0])
        return loaded

    async def set(self, key: str, value: JsonValue, ttl_s: int) -> bool:
        if self.down:
            return False
        # allow_nan=False: NaN is not JSON, and a real serialiser would refuse it.
        self._entries[key] = (json.dumps(value, allow_nan=False), self.now + ttl_s)
        self.ttls[key] = ttl_s
        return True


# ---------------------------------------------------------------- turn events


class RecordingSink(TurnSink):
    """Every event, in order, so a test can assert the frame sequence."""

    def __init__(self) -> None:
        self.events: list[tuple[object, ...]] = []

    def node(self, node: GraphNode, label: str) -> None:
        self.events.append(("node", node, label))

    def chunk(self, text: str) -> None:
        self.events.append(("chunk", text))

    def interrupt(self, question: str, options: Sequence[str]) -> None:
        self.events.append(("interrupt", question, tuple(options)))

    @property
    def text(self) -> str:
        return "".join(str(e[1]) for e in self.events if e[0] == "chunk")
