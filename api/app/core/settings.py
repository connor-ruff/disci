from functools import lru_cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, read from DISCI_* environment variables.

    There are deliberately no defaults for env, database_url or auth_mode, so a
    misconfigured deploy fails at startup instead of silently running with local values.
    """

    model_config = SettingsConfigDict(env_prefix="DISCI_")

    env: Literal["local", "test", "prod"]
    database_url: str
    auth_mode: Literal["dev", "cognito"]
    cors_origins: list[str] = ["http://localhost:5173"]
    # Log in to RDS with IAM auth tokens instead of a password (production).
    db_iam_auth: bool = False

    @model_validator(mode="after")
    def _dev_auth_only_outside_prod(self) -> Self:
        if self.auth_mode == "dev" and self.env == "prod":
            raise ValueError("DISCI_AUTH_MODE=dev is not allowed when DISCI_ENV=prod")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
