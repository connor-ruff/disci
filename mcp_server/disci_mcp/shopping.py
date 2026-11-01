"""Shopping list tools. Thin wrappers over the API's /shopping endpoints
(docs/api/api-overview.md §7.4), shaped for an assistant: read the list, add to it, cross
things off and remove them. Types and common items are managed in the app."""

import asyncio
from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import BaseModel, Field

from disci_mcp import api
from disci_mcp.common import DESTRUCTIVE, READ, WRITE, each

UNCATEGORIZED = "Uncategorized"


class ShoppingItem(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    type: str | None = Field(
        default=None,
        description='The shopping type\'s name, e.g. "Groceries" or "Kroger" (any case). '
        "Leave out for Uncategorized.",
    )
    notes: Annotated[str, Field(max_length=300)] | None = Field(
        default=None, description='Optional detail: "2 lbs", "size 10", "the blue one".'
    )


def _item(i: dict[str, Any]) -> dict[str, Any]:
    out = {"id": i["id"], "name": i["name"], "done": i["done"]}
    if i["notes"]:
        out["notes"] = i["notes"]
    return out


def _by_type(types: list[dict], rows: list[dict], shape) -> dict[str, list]:
    """Rows under their type's name, in the user's type order; Uncategorized last."""
    names = {t["id"]: t["name"] for t in types}
    out: dict[str, list] = {t["name"]: [] for t in types}
    for r in rows:
        out.setdefault(names.get(r["shopping_type_id"], UNCATEGORIZED), []).append(shape(r))
    return out


def _type_id(types: list[dict], name: str | None) -> str | None:
    if name is None or name.strip().lower() == UNCATEGORIZED.lower():
        return None
    for t in types:
        if t["name"].lower() == name.strip().lower():
            return t["id"]
    known = ", ".join(t["name"] for t in types) or "none yet"
    raise ToolError(f'No shopping type "{name}". The user\'s types: {known}.')


def register(mcp: FastMCP) -> None:
    @mcp.tool(annotations=READ)
    async def get_shopping_list() -> dict[str, Any]:
        """The user's shopping list by type (their own kinds or stores, e.g. "Groceries",
        "Kroger"), plus their common items: things they buy often.

        `done` items are crossed off (bought) but still on the list until removed. A common
        item's `on_list` says it's already on the list, not crossed off. Use for "what's on
        my grocery list?", to suggest what they might need, or to find item ids.
        """
        types, items, common = await asyncio.gather(
            api.get("/shopping/types"), api.get("/shopping/items"), api.get("/shopping/common")
        )
        return {
            "types": [t["name"] for t in types],
            "list": _by_type(types, items, _item),
            "common_items": _by_type(
                types, common, lambda c: {"name": c["name"], "on_list": c["on_list"]}
            ),
        }

    @mcp.tool(annotations=WRITE)
    async def add_shopping_items(items: list[ShoppingItem]) -> dict[str, Any]:
        """Put items on the user's shopping list.

        Give each a `type` from get_shopping_list's types when the user names one ("add
        eggs to my Kroger list") or it's obvious; otherwise leave it out (Uncategorized).
        An item already on that list (same name, not crossed off) isn't added twice.

        Returns each item's outcome.
        """
        types, current = await asyncio.gather(
            api.get("/shopping/types"), api.get("/shopping/items")
        )
        open_items = {
            (i["shopping_type_id"], i["name"].lower()): i for i in current if not i["done"]
        }

        async def add(item: ShoppingItem) -> dict[str, Any]:
            type_id = _type_id(types, item.type)
            existing = open_items.get((type_id, item.name.strip().lower()))
            if existing:
                return {"already_on_list": True, **_item(existing)}
            body = {"name": item.name, "shopping_type_id": type_id, "notes": item.notes}
            return _item(await api.post("/shopping/items", body))

        results = await each([i.name for i in items], [add(i) for i in items])
        return {"results": [{"name": r.pop("id"), **r} for r in results]}

    @mcp.tool(annotations=WRITE)
    async def check_off_shopping_items(item_ids: list[str], done: bool = True) -> dict[str, Any]:
        """Cross items off the list (bought), or put them back with done=False. Crossed-off
        items stay on the list until removed. Find ids with get_shopping_list."""
        results = await each(
            item_ids,
            [api.put(f"/shopping/items/{i}/done", {"done": done}) for i in item_ids],
        )
        return {"results": [r | {"result": _item(r["result"])} if r["ok"] else r for r in results]}

    @mcp.tool(annotations=DESTRUCTIVE)
    async def remove_shopping_items(
        item_ids: list[str] | None = None, clear_crossed_off: bool = False
    ) -> dict[str, Any]:
        """Remove items from the list for good: the given ids, and/or (clear_crossed_off)
        every crossed-off item on every list. Removed items aren't kept anywhere.

        Args:
            item_ids: Items to remove (ids from get_shopping_list).
            clear_crossed_off: Also remove everything crossed off, e.g. after a shopping trip.
        """
        if not item_ids and not clear_crossed_off:
            raise ToolError("Pass item_ids, clear_crossed_off=true, or both.")
        out: dict[str, Any] = {}
        if item_ids:
            out["results"] = await each(
                item_ids, [api.delete(f"/shopping/items/{i}") for i in item_ids]
            )
        if clear_crossed_off:
            cleared = await api.post("/shopping/items/clear-done", {"all_types": True})
            out["crossed_off_removed"] = cleared["removed"]
        return out
