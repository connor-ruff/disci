from functools import cache
from pathlib import Path


class Queries:
    """SQL for one package, loaded from its queries/ folder (one query per .sql file).

    Usage: `queries = Queries(__file__)`, then `conn.execute(queries["get_user"], params)`.

    SQL lives in files and is never assembled with string formatting; values are always
    passed as bound parameters (`%(name)s`). That is the project's SQL-injection rule.
    """

    def __init__(self, package_file: str) -> None:
        self._dir = Path(package_file).parent / "queries"

    def __getitem__(self, name: str) -> str:
        return _read(self._dir / f"{name}.sql")


@cache
def _read(path: Path) -> str:
    return path.read_text()
