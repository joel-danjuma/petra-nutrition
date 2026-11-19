"""What the lifespan builds and every request reads: settings, clients, and boot-time state."""

from dataclasses import dataclass

from fastapi import Request

from petra_agent.clients import Clients
from petra_agent.contract import Embeddings
from petra_agent.settings import Settings


@dataclass
class Runtime:
    settings: Settings
    clients: Clients
    # time.monotonic() when the lifespan started.
    started: float
    embeddings: Embeddings


def runtime(request: Request) -> Runtime:
    current: Runtime = request.app.state.runtime
    return current
