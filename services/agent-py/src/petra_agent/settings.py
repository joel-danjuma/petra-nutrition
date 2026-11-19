"""The agent's configuration, read from the environment once at boot.

Mirrors docs/agent-spec.md §12. What is absent is deliberate: no JWT, SMTP or
Stripe secrets, because the agent never authenticates a user. Every secret is a
``SecretStr``, so neither a repr nor a log line can print it.

Construction is validation: a broken deploy raises here, at boot, rather than
on the first chat turn.
"""

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Where an unset INTERNAL_API_KEY is tolerated. Anything else, staging included,
# must present a key (KI-15).
LOCAL_ENVS = frozenset({"development", "test"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
        # A rejected DATABASE_URL carries a password; never echo it.
        hide_input_in_errors=True,
        # Each field name is already one of its env names, so this adds none; it
        # lets mypy type the aliased fields.
        validate_by_name=True,
    )

    node_env: str = Field(default="development", validation_alias="NODE_ENV")
    port: int = Field(default=3002, validation_alias=AliasChoices("AGENT_PORT", "PORT"))

    database_url: SecretStr = Field(
        validation_alias=AliasChoices("AGENT_DATABASE_URL", "DATABASE_URL")
    )

    groq_api_key: SecretStr = Field(validation_alias="GROQ_API_KEY")
    gemini_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("GEMINI_API_KEY", "GOOGLE_AI_API_KEY")
    )
    groq_model_fast: str = Field(default="openai/gpt-oss-20b", validation_alias="GROQ_MODEL_FAST")
    groq_model_smart: str = Field(
        default="openai/gpt-oss-120b", validation_alias="GROQ_MODEL_SMART"
    )

    internal_api_key: SecretStr | None = Field(default=None, validation_alias="INTERNAL_API_KEY")

    redis_url: SecretStr | None = Field(default=None, validation_alias="REDIS_URL")
    graph_state_ttl_seconds: int = Field(
        default=3600, gt=0, validation_alias="GRAPH_STATE_TTL_SECONDS"
    )

    fdc_api_key: SecretStr | None = Field(default=None, validation_alias="FDC_API_KEY")
    recipe_overflow_enabled: bool = Field(default=False, validation_alias="RECIPE_OVERFLOW_ENABLED")

    transformers_cache: str = Field(default="./.model-cache", validation_alias="TRANSFORMERS_CACHE")
    log_level: str = Field(default="info", validation_alias="LOG_LEVEL")

    @field_validator("database_url")
    @classmethod
    def _postgres(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().startswith("postgresql://"):
            raise ValueError("DATABASE_URL must be a postgresql:// connection string")
        return value

    @model_validator(mode="after")
    def _key_outside_local(self) -> "Settings":
        if self.node_env not in LOCAL_ENVS and self.internal_api_key is None:
            raise ValueError(f"INTERNAL_API_KEY is required when NODE_ENV is {self.node_env!r}")
        return self

    @property
    def auth_disabled(self) -> bool:
        return self.node_env in LOCAL_ENVS and self.internal_api_key is None

    @property
    def is_development(self) -> bool:
        return self.node_env == "development"

    def warnings(self) -> list[str]:
        """Gaps that degrade the service without stopping it. Logged once at boot."""
        found: list[str] = []
        if self.redis_url is None:
            found.append(
                "REDIS_URL is unset: graph state and lookups use in-process memory, which "
                "does not survive a restart and is not shared between replicas"
            )
        if self.fdc_api_key is None:
            found.append("FDC_API_KEY is unset: nutrition lookups fall back to Open Food Facts")
        if self.auth_disabled:
            found.append("INTERNAL_API_KEY is unset: /v1 accepts unauthenticated calls")
        return found
