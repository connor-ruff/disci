"""Training HTTP routes, mounted at /training."""

from fastapi import APIRouter

from app.modules.training.routes import log, plans

router = APIRouter()
router.include_router(log.router)
router.include_router(plans.router)
