import os

# Must be set before the app is imported. `make api-test` creates this database fresh.
os.environ.update(
    DISCI_ENV="test",
    DISCI_AUTH_MODE="dev",
    DISCI_DATABASE_URL="postgresql://disci_api:disci_api@localhost:5432/disci_test",
)
OWNER_URL = "postgresql://disci:disci@localhost:5432/disci_test"

from collections.abc import Iterator  # noqa: E402

import psycopg  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import DEV_USER_HEADER  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_db() -> None:
    """Every test starts with empty tables."""
    with psycopg.connect(OWNER_URL) as conn:
        conn.execute("TRUNCATE core.user_modules, core.users CASCADE")


def as_user(sub: str) -> dict[str, str]:
    """Request headers that act as the given dev user."""
    return {DEV_USER_HEADER: sub}
