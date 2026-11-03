"""Settings mirror the agent's environment (docs/agent-spec.md §12) and refuse a broken deploy."""

import pytest
from pydantic import ValidationError

from petra_agent.settings import Settings


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    monkeypatch.setenv("DATABASE_URL", "postgresql://agent:pw@db:5432/petra")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
    return monkeypatch


def load() -> Settings:
    return Settings(_env_file=None)


def test_defaults_match_the_typescript_agent(env: pytest.MonkeyPatch) -> None:
    settings = load()

    assert settings.node_env == "development"
    assert settings.port == 3002
    assert settings.groq_model_fast == "openai/gpt-oss-20b"
    assert settings.groq_model_smart == "openai/gpt-oss-120b"
    assert settings.graph_state_ttl_seconds == 3600
    assert settings.recipe_overflow_enabled is False
    assert settings.transformers_cache == "./.model-cache"
    assert settings.log_level == "info"
    assert settings.redis_url is None
    assert settings.internal_api_key is None


def test_the_agent_specific_names_win_over_the_shared_ones(env: pytest.MonkeyPatch) -> None:
    env.setenv("AGENT_DATABASE_URL", "postgresql://reader@db:5432/petra")
    env.setenv("AGENT_PORT", "4000")
    env.setenv("PORT", "5000")
    env.setenv("GOOGLE_AI_API_KEY", "google-key")

    settings = load()

    assert settings.database_url.get_secret_value() == "postgresql://reader@db:5432/petra"
    assert settings.port == 4000
    assert settings.gemini_api_key is not None
    assert settings.gemini_api_key.get_secret_value() == "google-key"


def test_a_missing_groq_key_refuses_to_boot(env: pytest.MonkeyPatch) -> None:
    env.delenv("GROQ_API_KEY")

    with pytest.raises(ValidationError, match="GROQ_API_KEY"):
        load()


def test_a_non_postgres_url_refuses_to_boot_without_echoing_the_url(
    env: pytest.MonkeyPatch,
) -> None:
    env.setenv("DATABASE_URL", "mysql://agent:hunter2@db/petra")

    with pytest.raises(ValidationError) as error:
        load()

    assert "postgresql://" in str(error.value)
    assert "hunter2" not in str(error.value)


@pytest.mark.parametrize("node_env", ["production", "staging"])
def test_an_internal_key_is_required_everywhere_but_local(
    env: pytest.MonkeyPatch, node_env: str
) -> None:
    env.setenv("NODE_ENV", node_env)

    with pytest.raises(ValidationError, match="INTERNAL_API_KEY"):
        load()


def test_auth_is_off_only_locally_and_only_without_a_key(env: pytest.MonkeyPatch) -> None:
    assert load().auth_disabled is True

    env.setenv("INTERNAL_API_KEY", "k")
    assert load().auth_disabled is False


def test_secrets_never_appear_in_the_repr(env: pytest.MonkeyPatch) -> None:
    env.setenv("INTERNAL_API_KEY", "internal-secret")

    shown = repr(load())

    assert "gsk_test" not in shown
    assert "internal-secret" not in shown
    assert "pw@" not in shown


def test_warnings_name_the_missing_optional_services(env: pytest.MonkeyPatch) -> None:
    warnings = load().warnings()

    assert any("REDIS_URL" in w for w in warnings)
    assert any("FDC_API_KEY" in w for w in warnings)
    assert any("INTERNAL_API_KEY" in w for w in warnings)
