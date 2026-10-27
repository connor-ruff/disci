from app.core.module import Module
from app.modules.tasks.routes import router

module = Module(
    key="tasks",
    name="Tasks",
    description="Daily habits, upkeep, to-dos and things to keep in mind",
    router=router,
)
