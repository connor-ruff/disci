import logging
from typing import Any

from mangum import Mangum

from disci_mcp.server import create_app

logging.getLogger().setLevel(logging.INFO)
# Mangum logs the lifespan start/stop that now happens on every invocation.
logging.getLogger("mangum").setLevel(logging.WARNING)


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda entry point (disci-mcp), invoked by API Gateway (HTTP API, payload v2).

    Mangum runs the app's lifespan on every invocation, and the MCP session manager can
    only start once per instance, so each invocation gets a new app.
    """
    return Mangum(create_app(), lifespan="on")(event, context)
