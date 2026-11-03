"""The /v1 routes the API's agent-client calls, at the same paths as the TypeScript agent.

Each validates its body against the contract, so a mismatch is a 400 today.
Handlers land one by one; until then each answers 501.
"""

from fastapi import APIRouter, Depends

from petra_agent import contract
from petra_agent.auth import require_internal_key
from petra_agent.errors import AgentError

router = APIRouter(prefix="/v1", dependencies=[Depends(require_internal_key)])


def _not_implemented(route: str) -> AgentError:
    return AgentError(501, "NOT_IMPLEMENTED", f"{route} is not implemented yet")


@router.post("/chat", response_model=None)
async def chat(body: contract.ChatRequest) -> None:
    raise _not_implemented("/v1/chat")


@router.post("/chat/stream", response_model=None)
async def chat_stream(body: contract.ChatRequest) -> None:
    raise _not_implemented("/v1/chat/stream")


@router.post("/recipes/retrieve", response_model=None)
async def retrieve(body: contract.RetrieveRequest) -> None:
    raise _not_implemented("/v1/recipes/retrieve")


@router.post("/recipes/enrich", response_model=None)
async def enrich(body: contract.EnrichRecipeRequest) -> None:
    raise _not_implemented("/v1/recipes/enrich")


@router.post("/vision/pantry-items", response_model=None)
async def pantry_items(body: contract.VisionRequest) -> None:
    raise _not_implemented("/v1/vision/pantry-items")


@router.post("/vision/receipt", response_model=None)
async def receipt(body: contract.ReceiptRequest) -> None:
    raise _not_implemented("/v1/vision/receipt")


@router.post("/index/rebuild", response_model=None)
async def rebuild(body: contract.IndexRebuildRequest | None = None) -> None:
    # An empty body is allowed, as in the TypeScript agent.
    raise _not_implemented("/v1/index/rebuild")
