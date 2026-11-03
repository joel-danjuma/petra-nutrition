"""The seams core logic depends on. Vendor SDKs live behind these, in adapters/.

Types here are snake_case domain values, never the camelCase wire models in
contract.py: the HTTP edge converts, so a contract change cannot ripple into
the graph.

Cancellation is asyncio's. The edge cancels the turn's task when the client
goes away, and every adapter must let ``asyncio.CancelledError`` propagate:
never swallow it, never turn it into a partial success (docs/agent-spec.md,
KI-19 and KI-39).
"""

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

# ---------------------------------------------------------------- errors


class ProviderError(Exception):
    """A model provider failed. ``str(error)`` is safe to show a user.

    Adapters translate vendor errors into these and log the original, so the
    stream route and /v1/chat can both relay the message (KI-18).
    """


class RateLimited(ProviderError):
    def __init__(self, message: str, *, retry_after_s: float | None = None, daily: bool = False):
        super().__init__(message)
        self.retry_after_s = retry_after_s
        self.daily = daily


class ProviderUnavailable(ProviderError):
    pass


class LookupFailed(Exception):
    """A data source could not answer. Unlike ``None``, this must never be cached (KI-23)."""


# ---------------------------------------------------------------- models

ModelRole = Literal["router", "compose", "nutrition", "respond", "enrich"]
ChatRole = Literal["system", "user", "assistant"]


@dataclass(frozen=True, slots=True)
class ChatMessage:
    role: ChatRole
    content: str


@dataclass(frozen=True, slots=True)
class Completion:
    text: str
    # Which model actually served it: logged, never rendered.
    model: str
    tokens_used: int | None = None


class ChatModel(Protocol):
    """What a node sees. Deliberately smaller than any provider SDK.

    Raises ``ProviderError`` on failure. Temperature, token budget and JSON mode
    belong to the role and live in the adapter's table, not here.
    """

    @property
    def role(self) -> ModelRole: ...

    @property
    def model_id(self) -> str: ...

    async def complete(self, messages: Sequence[ChatMessage]) -> Completion: ...

    async def stream(
        self, messages: Sequence[ChatMessage], on_delta: Callable[[str], None]
    ) -> Completion:
        """Forward raw deltas to ``on_delta``, then return the whole reply.

        Deltas are unsanitised; only the caller knows whether the text is headed
        for a screen or a parser. On cancellation this raises, it does not
        return the text so far.
        """
        ...


class ModelProvider(Protocol):
    """The only way to reach a chat model. Nodes name a role, never a model."""

    def model_for(self, role: ModelRole, *, model: str | None = None) -> ChatModel:
        """``model`` overrides the role's table entry; the eval harness's entry point."""
        ...


# ---------------------------------------------------------------- vision

VisionTask = Literal["pantry_item", "receipt"]


@dataclass(frozen=True, slots=True)
class Image:
    data: bytes
    # Sniffed at the edge, not assumed to be JPEG (KI-29).
    mime_type: str


class VisionModel(Protocol):
    """Image plus prompt to text. Prompts and parsing stay in core, where they are testable.

    Raises ``ProviderError`` on failure. The adapter must never log a URL or
    error object that carries the key (KI-13).
    """

    async def read(self, task: VisionTask, image: Image, prompt: str) -> Completion: ...


# ---------------------------------------------------------------- embeddings


class Embedder(Protocol):
    @property
    def model_id(self) -> str: ...

    @property
    def dims(self) -> int: ...

    async def warm_up(self) -> None: ...

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """One L2-normalised vector of ``dims`` per text, in order."""
        ...


# ---------------------------------------------------------------- recipes


@dataclass(frozen=True, slots=True)
class CandidateFilter:
    """Applied by every candidate query: visibility, then safety.

    ``blocked_terms`` arrive already expanded to synonyms and plurals; the
    adapter only escapes them and matches each as a whole word, case-
    insensitively, against the title and every ingredient name.
    """

    owner_id: str | None
    blocked_terms: frozenset[str]


@dataclass(frozen=True, slots=True)
class Candidate:
    id: str
    # 0-based rank within the signal that produced it.
    rank: int


@dataclass(frozen=True, slots=True)
class SearchCapability:
    lexical: bool
    vectors: bool
    # Rows embedded with the model asked about.
    embedded: int


@dataclass(frozen=True, slots=True)
class HydratedRecipe:
    id: str
    title: str
    image_url: str | None
    cuisine: str | None
    total_time: int
    servings: int
    dietary_tags: tuple[str, ...]
    ingredients: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class IngredientLine:
    name: str
    amount: float
    unit: str


@dataclass(frozen=True, slots=True)
class LibraryRecipe:
    id: str
    servings: int
    # In recipe order.
    ingredients: tuple[IngredientLine, ...]


class RecipeLibrary(Protocol):
    """The read model: recipes and their embeddings, never user data.

    A signal that raises is dropped by the caller, so adapters raise rather
    than return an empty list on failure.
    """

    async def verify(self) -> int:
        """Probe the columns this service reads; raise on drift. Returns the public count."""
        ...

    async def capability(self, model: str) -> SearchCapability: ...

    async def pantry_candidates(
        self, pantry_terms: Sequence[Sequence[str]], where: CandidateFilter, limit: int
    ) -> list[Candidate]:
        """One term list per pantry item.

        An ingredient is covered when every term of some item matches it.
        """
        ...

    async def lexical_candidates(
        self, query: str, where: CandidateFilter, limit: int
    ) -> list[Candidate]: ...

    async def semantic_candidates(
        self, vector: Sequence[float], model: str, where: CandidateFilter, limit: int
    ) -> list[Candidate]: ...

    async def hydrate(self, ids: Sequence[str]) -> Mapping[str, HydratedRecipe]: ...

    async def library_recipe(self, recipe_id: str) -> LibraryRecipe | None: ...


@dataclass(frozen=True, slots=True)
class RecipeDocument:
    """What a recipe's embedding is built from."""

    id: str
    title: str
    description: str | None
    cuisine: str | None
    tags: tuple[str, ...]
    ingredient_names: tuple[str, ...]
    # The first two steps only.
    instructions: tuple[str, ...]


class EmbeddingIndex(Protocol):
    """``recipe_embeddings``: the one table this service writes."""

    async def documents(self, ids: Sequence[str]) -> list[RecipeDocument]: ...

    async def write_vector(self, recipe_id: str, vector: Sequence[float], model: str) -> None: ...


# ---------------------------------------------------------------- nutrition


@dataclass(frozen=True, slots=True)
class FoodMacros:
    """Per 100 g, which is how both databases report."""

    calories: float
    protein: float
    carbs: float
    fat: float
    fiber: float | None = None
    sugar: float | None = None
    # Milligrams per 100 g.
    sodium: float | None = None


@dataclass(frozen=True, slots=True)
class FoodMatch:
    macros: FoodMacros
    source: Literal["usda", "openfoodfacts"]
    # The row that was matched, verbatim, so a wrong match is visible.
    matched_as: str
    fdc_id: int | None = None


class FoodDatabase(Protocol):
    async def lookup(self, ingredient_name: str) -> FoodMatch | None:
        """``None`` means the databases have no such food.

        Raises ``LookupFailed`` when they could not be asked.
        """
        ...


# ---------------------------------------------------------------- overflow


@dataclass(frozen=True, slots=True)
class OverflowRecipe:
    title: str
    cuisine: str | None
    ingredients: tuple[str, ...]
    # Where it came from, so a log can attribute an idea to its source.
    source: str


class OverflowSource(Protocol):
    """Third-party recipe ideas that seed compose. Never raises: a failure is ``[]``.

    The query leaves the network, so it must not be the user's raw message (KI-16).
    """

    async def seeds(self, query: str, limit: int) -> list[OverflowRecipe]: ...


# ---------------------------------------------------------------- cache

type JsonValue = None | bool | int | float | str | list[JsonValue] | dict[str, JsonValue]


class Cache(Protocol):
    """Best-effort shared cache. Nothing here may fail a turn: no method raises.

    ``None`` from ``get`` is a miss. A caller that needs to cache "no answer"
    stores an envelope such as ``{"match": None}``.
    """

    async def get(self, key: str) -> JsonValue: ...

    async def set(self, key: str, value: JsonValue, ttl_s: int) -> bool:
        """``False`` when the write did not happen."""
        ...


# ---------------------------------------------------------------- turn events

GraphNode = Literal["router", "search", "compose_recipe", "nutrition", "respond"]


class TurnSink(Protocol):
    """Where a turn reports progress. Streaming turns write frames; others discard.

    Held in a context variable, never in graph state, because state must
    survive JSON.
    """

    def node(self, node: GraphNode, label: str) -> None: ...

    def chunk(self, text: str) -> None:
        """Visible prose, already sanitised by the caller."""
        ...

    def interrupt(self, question: str, options: Sequence[str]) -> None: ...
