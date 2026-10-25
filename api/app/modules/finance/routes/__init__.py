"""Finance HTTP routes, one file per area, all mounted at /finance."""

from fastapi import APIRouter

from app.modules.finance.routes import budgets, categories, checklist, recurring, transactions

router = APIRouter()
for area in (categories, budgets, transactions, recurring, checklist):
    router.include_router(area.router)
