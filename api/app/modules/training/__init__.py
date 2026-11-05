from app.core.module import Module
from app.modules.training.routes import router

module = Module(
    key="training",
    name="Training",
    description="Log runs, walks, rides and lifts, with sets, reps and what you did last time",
    router=router,
)
