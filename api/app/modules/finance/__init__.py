from app.core.module import Module
from app.modules.finance.router import router

module = Module(
    key="finance",
    name="Finance",
    description="Budgets, transactions and bills",
    router=router,
    # setup will seed default budget categories once finance tables exist.
)
