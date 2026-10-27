"""Helpers shared by the tool modules."""

import asyncio
from collections.abc import Awaitable
from decimal import Decimal
from typing import Any

from mcp.server.fastmcp.exceptions import ToolError
from mcp.types import ToolAnnotations

# Read tools run without asking; clients confirm the others with the user first.
READ = ToolAnnotations(readOnlyHint=True, openWorldHint=False)
WRITE = ToolAnnotations(readOnlyHint=False, destructiveHint=False, openWorldHint=False)
DESTRUCTIVE = ToolAnnotations(readOnlyHint=False, destructiveHint=True, openWorldHint=False)


async def each(ids: list[str], calls: list[Awaitable[Any]]) -> list[dict[str, Any]]:
    """Runs one API call per id and reports each outcome, so one failure doesn't hide the
    rest (every call is its own API transaction)."""
    results = await asyncio.gather(*calls, return_exceptions=True)
    out = []
    for id_, result in zip(ids, results, strict=True):
        if isinstance(result, ToolError):
            out.append({"id": id_, "ok": False, "error": str(result)})
        elif isinstance(result, BaseException):
            raise result
        else:
            out.append({"id": id_, "ok": True, "result": result})
    return out


def num(value: str | None) -> str | None:
    """A decimal string without trailing zeros: "170.000000" -> "170"."""
    if value is None:
        return None
    return f"{Decimal(value).normalize():f}"
