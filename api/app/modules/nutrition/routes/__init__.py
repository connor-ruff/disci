"""Nutrition HTTP routes, one file per area, all mounted at /nutrition."""

from fastapi import APIRouter

from app.modules.nutrition.routes import foods, goals, logs, preferences

router = APIRouter()
for area in (preferences, foods, logs, goals):
    router.include_router(area.router)
