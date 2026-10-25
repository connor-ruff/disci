from functools import cache
from typing import Any, Self

from psycopg import Connection
from psycopg.conninfo import conninfo_to_dict


class IamAuthConnection(Connection[dict[str, Any]]):
    """A connection that logs in with an RDS IAM auth token instead of a password.

    Tokens are valid for 15 minutes, so each new connection signs a fresh one (open
    connections stay valid). Signing happens locally with the Lambda's IAM role: no
    network call, which matters because the Lambdas have no internet access.
    """

    @classmethod
    def connect(cls, conninfo: str = "", **kwargs: Any) -> Self:
        params = conninfo_to_dict(conninfo, **kwargs)
        kwargs["password"] = rds_auth_token(
            host=str(params["host"]), port=int(params.get("port") or 5432), user=str(params["user"])
        )
        return super().connect(conninfo, **kwargs)


def rds_auth_token(host: str, port: int, user: str) -> str:
    return _rds_client().generate_db_auth_token(DBHostname=host, Port=port, DBUsername=user)


@cache
def _rds_client() -> Any:
    import boto3  # provided by the Lambda runtime; a dev-only dependency locally

    return boto3.client("rds")
