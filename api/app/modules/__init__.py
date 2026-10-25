"""The module registry: every module the app offers.

Adding a module = create app/modules/<key>/ exposing a `module` (see app/core/module.py)
and add it to the tuple below. Its router is mounted at /<key>.
"""

from app.core.module import Module
from app.modules import finance

MODULES: dict[str, Module] = {m.key: m for m in (finance.module,)}
