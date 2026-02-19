from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from . import models
from .routes import (
    auth, users, admin, schedule, monthly,
    daily, brigades, executors, analytics,
    employees, equipment, equipment_usage,
    import_export, websocket
)
from .routes import projects

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Construction Manager API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth & users
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])

# Projects
app.include_router(projects.router, prefix="/projects", tags=["projects"])

# Project-scoped data
app.include_router(schedule.router, prefix="/schedule", tags=["schedule"])
app.include_router(monthly.router, prefix="/monthly", tags=["monthly"])
app.include_router(daily.router, prefix="/daily", tags=["daily"])
app.include_router(brigades.router, prefix="/brigades", tags=["brigades"])
app.include_router(executors.router, prefix="/executors", tags=["executors"])
app.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
app.include_router(import_export.router, prefix="/import-export", tags=["import-export"])

# Global directories
app.include_router(employees.router, prefix="/employees", tags=["employees"])
app.include_router(equipment.router, prefix="/equipment", tags=["equipment"])
app.include_router(equipment_usage.router, prefix="/equipment-usage", tags=["equipment-usage"])

# WebSocket
app.include_router(websocket.router, prefix="/ws", tags=["websocket"])


@app.get("/")
def root():
    return {"message": "Construction Manager API v2.0"}
