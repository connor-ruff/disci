import psycopg
from fastapi.testclient import TestClient

from tests.conftest import OWNER_URL, as_user

ALICE = as_user("alice")


def finance_enabled(client: TestClient, headers: dict[str, str]) -> bool:
    modules = client.get("/me/modules", headers=headers).json()
    return next(m for m in modules if m["key"] == "finance")["enabled"]


def test_new_user_has_no_modules_enabled(client: TestClient) -> None:
    modules = client.get("/me/modules", headers=ALICE).json()

    assert [m["key"] for m in modules] == ["finance"]
    assert not any(m["enabled"] for m in modules)


def test_enable_disable_reenable(client: TestClient) -> None:
    assert client.put("/me/modules/finance", headers=ALICE).json()["enabled"] is True
    assert finance_enabled(client, ALICE)

    assert client.delete("/me/modules/finance", headers=ALICE).json()["enabled"] is False
    assert not finance_enabled(client, ALICE)

    client.put("/me/modules/finance", headers=ALICE)
    assert finance_enabled(client, ALICE)

    # Toggling flips one row rather than inserting new ones.
    with psycopg.connect(OWNER_URL) as conn:
        assert conn.execute("SELECT count(*) FROM core.user_modules").fetchone() == (1,)


def test_enable_is_idempotent(client: TestClient) -> None:
    client.put("/me/modules/finance", headers=ALICE)
    assert client.put("/me/modules/finance", headers=ALICE).status_code == 200


def test_modules_are_per_user(client: TestClient) -> None:
    client.put("/me/modules/finance", headers=ALICE)
    assert not finance_enabled(client, as_user("bob"))


def test_unknown_module_is_404(client: TestClient) -> None:
    assert client.put("/me/modules/astrology", headers=ALICE).status_code == 404
    assert client.delete("/me/modules/astrology", headers=ALICE).status_code == 404
