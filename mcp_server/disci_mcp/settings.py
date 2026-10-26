from functools import lru_cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """MCP server configuration, read from DISCI_MCP_* environment variables.

    Like the API, env, auth_mode and the URLs have no defaults, so a misconfigured deploy
    fails at startup instead of silently running with local values.
    """

    model_config = SettingsConfigDict(env_prefix="DISCI_MCP_")

    env: Literal["local", "test", "prod"]
    auth_mode: Literal["dev", "cognito"]
    # Base URL clients reach this server at (no trailing slash). The MCP endpoint is
    # <public_url>/mcp, and Claude requires the OAuth metadata to name it exactly.
    public_url: str
    # The Disci API the tools call (no trailing slash).
    api_url: str
    # cognito mode: the user pool's issuer and the disci-mcp app client.
    cognito_issuer: str | None = None
    cognito_client_id: str | None = None
    # dev mode: the dev user the API acts as (sent as X-Dev-User).
    dev_user: str = "local-dev-user"

    @model_validator(mode="after")
    def _check_auth(self) -> Self:
        if self.auth_mode == "dev" and self.env == "prod":
            raise ValueError("DISCI_MCP_AUTH_MODE=dev is not allowed when DISCI_MCP_ENV=prod")
        if self.auth_mode == "cognito" and not (self.cognito_issuer and self.cognito_client_id):
            raise ValueError("cognito auth needs DISCI_MCP_COGNITO_ISSUER and _CLIENT_ID")
        self.public_url = self.public_url.rstrip("/")
        self.api_url = self.api_url.rstrip("/")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
