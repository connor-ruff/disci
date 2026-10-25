"""AWS Lambda entry point: API Gateway (HTTP API, payload v2) → FastAPI, via Mangum."""

from mangum import Mangum

from app.core.db import open_pool
from app.core.settings import get_settings
from app.main import app

# Open the connection pool once per Lambda container, at cold start. Mangum runs the
# app's lifespan (startup and shutdown) around every single invocation, which would
# open and close the pool on each request, so it's turned off here.
_settings = get_settings()
open_pool(_settings.database_url, iam_auth=_settings.db_iam_auth)

handler = Mangum(app, lifespan="off")
