from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List

class Settings(BaseSettings):
    # Database
    database_url: str = Field(..., env="DATABASE_URL")
    
    # JWT
    secret_key: str = Field(..., env="SECRET_KEY")
    algorithm: str = Field("HS256", env="ALGORITHM")
    access_token_expire_minutes: int = Field(1440, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    
    # File upload
    max_audio_size: int = Field(50 * 1024 * 1024, env="MAX_AUDIO_SIZE")
    max_video_size: int = Field(1000 * 1024 * 1024, env="MAX_VIDEO_SIZE")
    allowed_audio_formats: List[str] = ["mp3", "wav", "ogg"]
    allowed_video_formats: List[str] = ["mp4", "webm"]
    
    upload_folder: str = Field("media", env="UPLOAD_FOLDER")
    voice_messages_folder: str = Field("voice_messages", env="VOICE_MESSAGES_FOLDER")
    presenter_recordings_folder: str = Field("presenter_recordings", env="PRESENTER_RECORDINGS_FOLDER")
    
    # Roles
    roles: dict = {
        'user': 'Пользователь',
        'broadcaster': 'Ведущий',
        'admin': 'Администратор'
    }
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()