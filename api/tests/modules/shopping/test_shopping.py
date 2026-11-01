from fastapi.testclient import TestClient

from tests.conftest import as_user

ALICE = as_user("alice")
BOB = as_user("bob")


def new_type(client: TestClient, name: str, headers=ALICE) -> dict:
    resp = client.post("/shopping/types", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def add(client: TestClient, name: str, headers=ALICE, **body) -> dict:
    resp = client.post("/shopping/items", json={"name": name, **body}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def add_common(client: TestClient, name: str, **body) -> dict:
    resp = client.post("/shopping/common", json={"name": name, **body}, headers=ALICE)
    assert resp.status_code == 201, resp.text
    return resp.json()


def items(client: TestClient, headers=ALICE) -> list[dict]:
    return client.get("/shopping/items", headers=headers).json()


def names(rows: list[dict]) -> list[str]:
    return [r["name"] for r in rows]


def test_first_enable_starts_with_groceries(client: TestClient) -> None:
    client.put("/me/modules/shopping", headers=ALICE)
    assert names(client.get("/shopping/types", headers=ALICE).json()) == ["Groceries"]


def test_types_are_ordered_unique_and_renamable(client: TestClient) -> None:
    kroger = new_type(client, "Kroger")
    tj = new_type(client, " Trader Joe's ")
    assert tj["name"] == "Trader Joe's"
    assert client.post("/shopping/types", json={"name": "kroger"}, headers=ALICE).status_code == 409
    assert client.post("/shopping/types", json={"name": "  "}, headers=ALICE).status_code == 422

    order = client.put(
        "/shopping/types/order", json={"ids": [tj["id"], kroger["id"]]}, headers=ALICE
    )
    assert names(order.json()) == ["Trader Joe's", "Kroger"]

    renamed = client.put(
        f"/shopping/types/{kroger['id']}", json={"name": "Kroger Plus"}, headers=ALICE
    )
    assert renamed.json()["name"] == "Kroger Plus"


def test_items_go_last_in_their_type_and_keep_notes(client: TestClient) -> None:
    kroger = new_type(client, "Kroger")
    milk = add(client, " Milk ", shopping_type_id=kroger["id"], notes="  2% ")
    assert (milk["name"], milk["notes"], milk["done"]) == ("Milk", "2%", False)
    socks = add(client, "Socks", notes="   ")
    assert (socks["shopping_type_id"], socks["notes"]) == (None, None)
    eggs = add(client, "Eggs", shopping_type_id=kroger["id"])
    assert eggs["sort_order"] > milk["sort_order"]

    order = client.put(
        "/shopping/items/order", json={"ids": [eggs["id"], milk["id"], socks["id"]]}, headers=ALICE
    )
    assert names(order.json()) == ["Eggs", "Milk", "Socks"]


def test_unknown_or_deleted_type_is_rejected(client: TestClient) -> None:
    gone = new_type(client, "Gone")
    client.delete(f"/shopping/types/{gone['id']}", headers=ALICE)
    for type_id in (gone["id"], new_type(client, "Bob's", headers=BOB)["id"]):
        body = {"name": "Milk", "shopping_type_id": type_id}
        assert client.post("/shopping/items", json=body, headers=ALICE).status_code == 422
        assert client.post("/shopping/common", json=body, headers=ALICE).status_code == 422


def test_cross_off_stays_until_removed(client: TestClient) -> None:
    milk = add(client, "Milk")
    done = client.put(
        f"/shopping/items/{milk['id']}/done", json={"done": True}, headers=ALICE
    ).json()
    assert done["done"] and done["done_at"]
    assert items(client)[0]["done"] is True

    back = client.put(f"/shopping/items/{milk['id']}/done", json={"done": False}, headers=ALICE)
    assert back.json()["done_at"] is None

    assert client.delete(f"/shopping/items/{milk['id']}", headers=ALICE).status_code == 204
    assert items(client) == []
    assert client.delete(f"/shopping/items/{milk['id']}", headers=ALICE).status_code == 404


def test_clear_done_by_type_or_everywhere(client: TestClient) -> None:
    kroger = new_type(client, "Kroger")
    pairs = [("Milk", kroger["id"]), ("Eggs", kroger["id"]), ("Socks", None), ("Tape", None)]
    rows = [add(client, n, shopping_type_id=t) for n, t in pairs]
    for r in (rows[0], rows[2], rows[3]):
        client.put(f"/shopping/items/{r['id']}/done", json={"done": True}, headers=ALICE)

    cleared = client.post(
        "/shopping/items/clear-done", json={"shopping_type_id": None}, headers=ALICE
    )
    assert cleared.json() == {"removed": 2}
    assert names(items(client)) == ["Milk", "Eggs"]

    cleared = client.post("/shopping/items/clear-done", json={"all_types": True}, headers=ALICE)
    assert cleared.json() == {"removed": 1}
    assert names(items(client)) == ["Eggs"]


def test_moving_an_item_puts_it_last_in_the_new_type(client: TestClient) -> None:
    kroger = new_type(client, "Kroger")
    add(client, "Milk", shopping_type_id=kroger["id"])
    tape = add(client, "Tape")
    moved = client.put(
        f"/shopping/items/{tape['id']}",
        json={"name": "Tape", "shopping_type_id": kroger["id"], "notes": "clear"},
        headers=ALICE,
    ).json()
    assert (moved["shopping_type_id"], moved["notes"]) == (kroger["id"], "clear")
    assert names(items(client)) == ["Milk", "Tape"]


def test_deleting_a_type_uncategorizes_its_things(client: TestClient) -> None:
    kroger = new_type(client, "Kroger")
    add(client, "Socks")
    add(client, "Milk", shopping_type_id=kroger["id"])
    add_common(client, "Eggs", shopping_type_id=kroger["id"])
    assert client.delete(f"/shopping/types/{kroger['id']}", headers=ALICE).status_code == 204

    assert [(i["name"], i["shopping_type_id"]) for i in items(client)] == [
        ("Socks", None),
        ("Milk", None),
    ]
    [eggs] = client.get("/shopping/common", headers=ALICE).json()
    assert eggs["shopping_type_id"] is None
    assert client.get("/shopping/types", headers=ALICE).json() == []


def test_common_items_unique_per_type(client: TestClient) -> None:
    kroger = new_type(client, "Kroger")
    add_common(client, "Eggs", shopping_type_id=kroger["id"])
    add_common(client, "Eggs")  # Uncategorized is its own list
    dup = client.post("/shopping/common", json={"name": "eggs"}, headers=ALICE)
    assert dup.status_code == 409


def test_adding_a_common_item_copies_it_once(client: TestClient) -> None:
    kroger = new_type(client, "Kroger")
    eggs = add_common(client, "Eggs", shopping_type_id=kroger["id"], notes="dozen")
    assert eggs["on_list"] is False

    resp = client.post(f"/shopping/common/{eggs['id']}/add", headers=ALICE)
    assert resp.status_code == 201
    item = resp.json()
    assert (item["name"], item["notes"], item["shopping_type_id"]) == (
        "Eggs",
        "dozen",
        kroger["id"],
    )
    assert client.get("/shopping/common", headers=ALICE).json()[0]["on_list"] is True

    again = client.post(f"/shopping/common/{eggs['id']}/add", headers=ALICE)
    assert (again.status_code, again.json()["id"]) == (200, item["id"])

    # Crossed off counts as bought: adding it again puts a fresh one on the list.
    client.put(f"/shopping/items/{item['id']}/done", json={"done": True}, headers=ALICE)
    assert client.post(f"/shopping/common/{eggs['id']}/add", headers=ALICE).status_code == 201
    assert len(items(client)) == 2

    # Editing the common item doesn't touch the list (no link is kept).
    client.put(f"/shopping/common/{eggs['id']}", json={"name": "Brown eggs"}, headers=ALICE)
    assert set(names(items(client))) == {"Eggs"}


def test_save_as_common_while_adding(client: TestClient) -> None:
    add_common(client, "Milk", notes="whole")
    add(client, "Milk", notes="2%", save_as_common=True)  # exists: left as it is
    add(client, "Bread", save_as_common=True)
    common = {c["name"]: c for c in client.get("/shopping/common", headers=ALICE).json()}
    assert common["Milk"]["notes"] == "whole"
    assert common["Bread"]["on_list"] is True


def test_users_see_only_their_own(client: TestClient) -> None:
    milk = add(client, "Milk")
    kroger = new_type(client, "Kroger")
    eggs = add_common(client, "Eggs")
    assert items(client, BOB) == []
    assert client.get("/shopping/types", headers=BOB).json() == []
    assert client.get("/shopping/common", headers=BOB).json() == []
    assert (
        client.put(
            f"/shopping/items/{milk['id']}/done", json={"done": True}, headers=BOB
        ).status_code
        == 404
    )
    assert client.delete(f"/shopping/items/{milk['id']}", headers=BOB).status_code == 404
    assert client.delete(f"/shopping/types/{kroger['id']}", headers=BOB).status_code == 404
    assert client.post(f"/shopping/common/{eggs['id']}/add", headers=BOB).status_code == 404
    client.post("/shopping/items/clear-done", json={"all_types": True}, headers=BOB)
    assert len(items(client)) == 1
