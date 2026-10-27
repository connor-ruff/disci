import asyncio

import httpx
import pytest
from mcp.server.fastmcp.exceptions import ToolError

from disci_mcp import api


def answer(monkeypatch: pytest.MonkeyPatch, status: int, json: object = None) -> None:
    """Makes every API call get this response."""
    transport = httpx.MockTransport(lambda request: httpx.Response(status, json=json))
    real = httpx.AsyncClient
    monkeypatch.setattr(api.httpx, "AsyncClient", lambda **kw: real(transport=transport, **kw))


@pytest.mark.parametrize(
    ("status", "body", "message"),
    [
        (409, {"detail": "a food with this name already exists"},
         "Disci API error 409: a food with this name already exists"),
        (422, {"detail": [{"loc": ["body", "amount"], "msg": "must be > 0"}]},
         "Disci API error 422: body.amount: must be > 0"),
        (403, {"detail": "x"}, "Sign in to the Disci web app once first, then try again."),
    ],
)  # fmt: skip
def test_errors_carry_the_api_message(
    monkeypatch: pytest.MonkeyPatch, status: int, body: object, message: str
) -> None:
    answer(monkeypatch, status, body)
    with pytest.raises(ToolError) as e:
        asyncio.run(api.post("/nutrition/foods", {}))
    assert str(e.value) == message


def test_no_content_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    answer(monkeypatch, 204)
    assert asyncio.run(api.delete("/finance/transactions/t1")) is None
