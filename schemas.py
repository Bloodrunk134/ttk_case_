from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, List
import re

# =============================================
# User schemas
# =============================================

class UserBase(BaseModel):
    login: str
    full_name: str
    
    @validator('login')
    def validate_login(cls, v):
        if not v or not v.isalpha():
            raise ValueError('Логин должен содержать только латинские буквы')
        return v
    
    @validator('full_name')
    def validate_full_name(cls, v):
        if not v:
            raise ValueError('ФИО обязательно')
        if not re.match(r'^[А-Яа-я\s]+$', v):
            raise ValueError('ФИО должно содержать только русские буквы и пробелы')
        return v

class UserCreate(UserBase):
    password: str
    password_confirm: str
    
    @validator('password')
    def validate_password(cls, v):
        if not v:
            raise ValueError('Пароль обязателен')
        if len(v) < 4:
            raise ValueError('Пароль должен быть не менее 4 символов')
        if not re.match(r'^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:\'",.<>/?\\|`~]+$', v):
            raise ValueError('Пароль может содержать только латинские буквы, цифры и символы')
        return v
    
    @validator('password_confirm')
    def passwords_match(cls, v, values):
        if 'password' in values and v != values['password']:
            raise ValueError('Пароли не совпадают')
        return v

class UserLogin(BaseModel):
    login: str
    password: str

class UserResponse(BaseModel):
    id: int
    login: str
    full_name: str
    roles: List[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    login: str
    full_name: str

class UserRolesUpdate(BaseModel):
    roles: List[str]

# =============================================
# Message schemas
# =============================================

class MessageCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)

class MessageResponse(BaseModel):
    id: int
    user_id: int
    user_login: Optional[str] = None
    user_name: Optional[str] = None
    text: str
    status: str
    response_text: Optional[str] = None
    responded_by: Optional[int] = None
    responded_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class MessageStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(new|in_progress|completed)$")
    response_text: Optional[str] = None

# =============================================
# Media schemas
# =============================================

class MediaResponse(BaseModel):
    id: int
    file_name: str
    file_type: str
    file_format: str
    file_size: int
    duration: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True

# =============================================
# Playlist schemas
# =============================================

class PlaylistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)

class PlaylistResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    loop_mode: bool
    shuffle_mode: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class PlaylistModesUpdate(BaseModel):
    loop_mode: Optional[bool] = None
    shuffle_mode: Optional[bool] = None

class PlaylistItemCreate(BaseModel):
    media_id: int
    position: Optional[int] = None

class PlaylistItemResponse(BaseModel):
    id: int
    position: int
    media: MediaResponse
    
    class Config:
        from_attributes = True

# =============================================
# Broadcast schemas
# =============================================

class BroadcastStatusResponse(BaseModel):
    id: int
    is_broadcasting: bool
    current_media_id: Optional[int]
    current_media_type: Optional[str]
    current_position: Optional[int]
    volume: int
    is_video_mode: bool
    updated_at: datetime
    
    class Config:
        from_attributes = True

class BroadcastControl(BaseModel):
    is_broadcasting: Optional[bool] = None
    volume: Optional[int] = Field(None, ge=0, le=100)
    is_video_mode: Optional[bool] = None
    current_media_id: Optional[int] = None
    current_media_type: Optional[str] = None

# =============================================
# Voice message schemas
# =============================================

class VoiceMessageResponse(BaseModel):
    id: int
    file_path: str
    file_size: int
    duration: Optional[int]
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# =============================================
# Common schemas
# =============================================

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[int] = None
    roles: List[str] = []

class ErrorResponse(BaseModel):
    detail: str

class SuccessResponse(BaseModel):
    message: str
