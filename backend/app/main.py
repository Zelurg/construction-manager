from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routes import router
from .routes.auth import router as auth_router
from .routes.users import router as users_router
from .routes.websocket import router as websocket_router
from .routes.admin import router as admin_router
import os
from dotenv import load_dotenv

load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Construction Manager API")

# Для разработки разрешаем все источники
# В продакшене нужно указать конкретные домены
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

# Добавляем поддержку локальной сети
# Получаем дополнительные origins из .env если они есть
env_origins = os.getenv("CORS_ORIGINS", "")
if env_origins:
    origins.extend(env_origins.split(","))

# Для разработки в локальной сети можно временно разрешить все
# ВНИМАНИЕ: в продакшене это небезопасно!
if os.getenv("ALLOW_ALL_ORIGINS", "false").lower() == "true":
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутов
app.include_router(router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(websocket_router, prefix="/api")
app.include_router(admin_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Construction Manager API"}
