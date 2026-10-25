import psycopg
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.settings import Settings
from tests.conftest import OWNER_URL, as_user

SETTINGS = {"display_name": "Connor", "timezone": "America/Chicago", "week_starts_on": 7}


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_first_request_creates_user_once(client: TestClient) -> None:
    first = client.get("/me", headers=as_user("alice"))
    second = client.get("/me", headers=as_user("alice"))

    assert first.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["email"] == "alice@disci.local"
    assert first.json()["timezone"] == "UTC"
    assert first.json()["week_starts_on"] == 1


def test_update_settings(client: TestClient) -> None:
    resp = client.put("/me", json=SETTINGS, headers=as_user("alice"))

    assert resp.status_code == 200
    assert {k: resp.json()[k] for k in SETTINGS} == SETTINGS
    assert client.get("/me", headers=as_user("alice")).json()["display_name"] == "Connor"


@pytest.mark.parametrize(
    "bad", [{"timezone": "Mars/Olympus_Mons"}, {"week_starts_on": 0}, {"week_starts_on": 8}]
)
def test_update_settings_rejects_invalid_values(client: TestClient, bad: dict) -> None:
    resp = client.put("/me", json=SETTINGS | bad, headers=as_user("alice"))
    assert resp.status_code == 422


def test_users_only_see_themselves(client: TestClient) -> None:
    client.put("/me", json=SETTINGS, headers=as_user("alice"))
    bob = client.get("/me", headers=as_user("bob")).json()

    assert bob["display_name"] is None
    assert bob["email"] == "bob@disci.local"


def test_rls_hides_other_users_rows() -> None:
    """Directly as the API's role: without app.user_id set, no user rows are visible."""
    with psycopg.connect(OWNER_URL) as conn:
        conn.execute("INSERT INTO core.users (cognito_sub, email) VALUES ('x', 'x@disci.local')")

    api_url = OWNER_URL.replace("disci:disci@", "disci_api:disci_api@")
    with psycopg.connect(api_url) as conn:
        assert conn.execute("SELECT count(*) FROM core.users").fetchone() == (0,)


def test_dev_auth_is_refused_in_prod() -> None:
    with pytest.raises(ValidationError, match="not allowed"):
        Settings(env="prod", auth_mode="dev", database_url="postgresql://x")
