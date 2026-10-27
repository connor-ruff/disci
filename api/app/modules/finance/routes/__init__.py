"""Finance HTTP routes, one file per area, all mounted at /finance."""

from fastapi import APIRouter

from app.modules.finance.routes import (
    budgets,
    categories,
    checklist,
    inbox,
    preferences,
    recurring,
    transactions,
)

router = APIRouter()
for area in (preferences, categories, budgets, transactions, inbox, recurring, checklist):
    router.include_router(area.router)
