import pytest

from tests.conftest import FakeApi, call_tool

TYPES = [{"id": "t-kroger", "name": "Kroger", "sort_order": 1},
         {"id": "t-clothes", "name": "Clothing", "sort_order": 2}]  # fmt: skip


def item(id_: str, type_id: str | None, done: bool = False, notes: str | None = None) -> dict:
    done_at = "2026-10-31T12:00:00Z" if done else None
    return {"id": id_, "shopping_type_id": type_id, "name": id_.title(), "notes": notes,
            "sort_order": 1, "done": done, "done_at": done_at}  # fmt: skip


MILK = item("milk", "t-kroger", notes="2%")
EGGS = item("eggs", "t-kroger", done=True)
TAPE = item("tape", None)


@pytest.fixture
def shopping(fake_api: FakeApi) -> FakeApi:
    fake_api.routes |= {
        ("GET", "/shopping/types"): TYPES,
        ("GET", "/shopping/items"): [MILK, EGGS, TAPE],
        ("GET", "/shopping/common"): [
            {"id": "c1", "shopping_type_id": "t-kroger", "name": "Milk", "notes": None,
             "on_list": True},
            {"id": "c2", "shopping_type_id": None, "name": "Batteries", "notes": None,
             "on_list": False},
        ],
    }  # fmt: skip
    return fake_api


def test_get_list_groups_by_type_name(shopping: FakeApi) -> None:
    result = call_tool("get_shopping_list", {})
    assert result["types"] == ["Kroger", "Clothing"]
    assert result["list"] == {
        "Kroger": [{"id": "milk", "name": "Milk", "done": False, "notes": "2%"},
                   {"id": "eggs", "name": "Eggs", "done": True}],
        "Clothing": [],
        "Uncategorized": [{"id": "tape", "name": "Tape", "done": False}],
    }  # fmt: skip
    assert result["common_items"]["Uncategorized"] == [{"name": "Batteries", "on_list": False}]


def test_add_resolves_types_and_skips_whats_already_on(shopping: FakeApi) -> None:
    shopping.routes[("POST", "/shopping/items")] = lambda body: item(
        "new", body["shopping_type_id"]
    )
    result = call_tool("add_shopping_items", {"items": [
        {"name": "milk", "type": "KROGER"},  # open on Kroger already
        {"name": "Eggs", "type": "Kroger"},  # crossed off, so a fresh one goes on
        {"name": "Socks", "type": "clothing", "notes": "wool"},
        {"name": "Tape"},  # Uncategorized, already there
        {"name": "Bread", "type": "Aldi"},
    ]})["results"]  # fmt: skip

    assert [r["ok"] for r in result] == [True, True, True, True, False]
    assert result[0]["result"]["already_on_list"] and result[3]["result"]["already_on_list"]
    assert "Kroger, Clothing" in result[4]["error"]
    assert shopping.sent("POST", "/shopping/items") == [
        {"name": "Eggs", "shopping_type_id": "t-kroger", "notes": None},
        {"name": "Socks", "shopping_type_id": "t-clothes", "notes": "wool"},
    ]


def test_check_off_and_back(shopping: FakeApi) -> None:
    shopping.routes[("PUT", "/shopping/items/milk/done")] = lambda body: (
        MILK | {"done": body["done"]}
    )
    [r] = call_tool("check_off_shopping_items", {"item_ids": ["milk"]})["results"]
    assert r["result"]["done"] is True
    call_tool("check_off_shopping_items", {"item_ids": ["milk"], "done": False})
    assert shopping.sent("PUT", "/shopping/items/milk/done") == [{"done": True}, {"done": False}]


def test_remove_items_and_clear_crossed_off(shopping: FakeApi) -> None:
    shopping.routes[("DELETE", "/shopping/items/tape")] = None
    shopping.routes[("POST", "/shopping/items/clear-done")] = {"removed": 1}
    result = call_tool("remove_shopping_items", {"item_ids": ["tape"], "clear_crossed_off": True})
    assert result["results"][0]["ok"] and result["crossed_off_removed"] == 1
    assert shopping.sent("POST", "/shopping/items/clear-done") == [{"all_types": True}]

    with pytest.raises(AssertionError, match="Pass item_ids"):
        call_tool("remove_shopping_items", {})
