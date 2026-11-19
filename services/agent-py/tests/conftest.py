import pytest

# Every variable Settings reads, so a developer's shell can't change a result.
AGENT_ENV = (
    "NODE_ENV",
    "AGENT_PORT",
    "PORT",
    "AGENT_DATABASE_URL",
    "DATABASE_URL",
    "GROQ_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_AI_API_KEY",
    "GROQ_MODEL_FAST",
    "GROQ_MODEL_SMART",
    "INTERNAL_API_KEY",
    "REDIS_URL",
    "GRAPH_STATE_TTL_SECONDS",
    "FDC_API_KEY",
    "RECIPE_OVERFLOW_ENABLED",
    "TRANSFORMERS_CACHE",
    "LOG_LEVEL",
)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in AGENT_ENV:
        monkeypatch.delenv(name, raising=False)
