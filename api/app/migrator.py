"""Lambda that brings the production database up to date (the `disci-migrator` function).

The deploy script invokes it before shipping new API code:
  1. ensure the roles the app needs exist (db/aws/roles.sql), then
  2. apply pending migrations with dbmate (db/migrations; binary at bin/dbmate).
Both are bundled into the deployment zip by scripts/build-api-zip.sh. It connects as
the RDS master user, which owns the schema.
"""

import logging
import os
import subprocess
from pathlib import Path
from typing import Any

import psycopg

logger = logging.getLogger()
logger.setLevel(logging.INFO)

PACKAGE_ROOT = Path(__file__).resolve().parent.parent


def handler(event: dict[str, Any], context: Any) -> dict[str, str]:
    database_url = os.environ["DISCI_MIGRATOR_DATABASE_URL"]

    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute((PACKAGE_ROOT / "db" / "aws" / "roles.sql").read_text())
    logger.info("roles ensured")

    result = subprocess.run(  # noqa: S603 - fixed, bundled binary and arguments
        [
            str(PACKAGE_ROOT / "bin" / "dbmate"),
            "--no-dump-schema",
            "--migrations-dir",
            str(PACKAGE_ROOT / "db" / "migrations"),
            "up",
        ],
        env={**os.environ, "DATABASE_URL": database_url},
        capture_output=True,
        text=True,
        check=False,
    )
    logger.info("dbmate stdout:\n%s", result.stdout)
    if result.returncode != 0:
        logger.error("dbmate stderr:\n%s", result.stderr)
        raise RuntimeError(f"dbmate failed: {result.stderr.strip()}")

    return {"migrations": result.stdout.strip() or "no pending migrations"}
