import pytest
from fastapi.testclient import TestClient

from tests.conftest import as_user


def test_one_line_per_request(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    headers = {**as_user("logger"), "X-Request-Id": "mcp-req-1"}
    with caplog.at_level("INFO", logger="app.requests"):
        client.get("/me", headers=headers)
        client.get("/no-such-path")
    first, second = [r for r in caplog.records if r.name == "app.requests"]

    assert first.getMessage().startswith("GET /me -> 200 (")
    assert (first.method, first.path, first.status) == ("GET", "/me", 200)  # type: ignore[attr-defined]
    assert first.caller_request_id == "mcp-req-1"  # type: ignore[attr-defined]
    assert isinstance(first.duration_ms, int)  # type: ignore[attr-defined]
    # Dev auth has no gateway claims.
    assert first.sub is None  # type: ignore[attr-defined]

    assert second.status == 404  # type: ignore[attr-defined]
    assert second.caller_request_id is None  # type: ignore[attr-defined]
