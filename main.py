from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from contextlib import asynccontextmanager

from config import settings
from database import engine, Base
from routers import auth, admin, player, broadcaster

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Base.metadata.create_all(bind=engine)
    
    # Создание папок для загрузок
    os.makedirs(settings.upload_folder, exist_ok=True)
    os.makedirs(settings.voice_messages_folder, exist_ok=True)
    os.makedirs(settings.presenter_recordings_folder, exist_ok=True)
    os.makedirs("static", exist_ok=True)
    os.makedirs("static/css", exist_ok=True)
    os.makedirs("static/js", exist_ok=True)
    
    yield

app = FastAPI(
    title="Radio Broadcasting System API",
    description="Система управления потоковым вещанием",
    version="1.0.0",
    lifespan=lifespan
)

# CORS настройки
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(player.router)
app.include_router(broadcaster.router)

# Статические файлы
app.mount("/media", StaticFiles(directory=settings.upload_folder), name="media")
app.mount("/voice_messages", StaticFiles(directory=settings.voice_messages_folder), name="voice_messages")
app.mount("/recordings", StaticFiles(directory=settings.presenter_recordings_folder), name="recordings")
app.mount("/css", StaticFiles(directory="static/css"), name="css")
app.mount("/js", StaticFiles(directory="static/js"), name="js")

# Обслуживание HTML файлов
@app.get("/")
@app.get("/{filename}.html")
async def serve_html(filename: str = "index"):
    html_path = f"static/{filename}.html"
    if os.path.exists(html_path):
        return FileResponse(html_path)
    return FileResponse("static/index.html")

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
# Тестовый эндпоинт для проверки пароля
@app.post("/api/test-login")
async def test_login(data: dict):
    from database import SessionLocal
    from models import User
    import hashlib
    
    login = data.get("login")
    password = data.get("password")
    
    db = SessionLocal()
    user = db.query(User).filter(User.login == login).first()
    db.close()
    
    if not user:
        return {"error": "User not found", "login": login}
    
    hashed = hashlib.sha256(password.encode()).hexdigest()
    
    return {
        "login": login,
        "user_exists": True,
        "stored_hash": user.password_hash,
        "input_hash": hashed,
        "match": user.password_hash == hashed,
        "password_entered": password
    }
