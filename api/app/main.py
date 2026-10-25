from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.db import close_pool, open_pool
from app.core.settings import get_settings
from app.core.user_modules.router import router as user_modules_router
from app.core.users.router import router as users_router
from app.modules import MODULES


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    open_pool(get_settings().database_url)
    yield
    close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Disci API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(users_router)
    app.include_router(user_modules_router)
    for module in MODULES.values():
        app.include_router(module.router, prefix=f"/{module.key}", tags=[module.name])

    return app


app = create_app()
