from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime
import os
import aiofiles
from typing import Optional
from database import get_db
from models import User, Message, BroadcastStatus, VoiceMessage
from schemas import (
    MessageCreate, MessageResponse, BroadcastStatusResponse,
    VoiceMessageResponse, SuccessResponse, ErrorResponse
)
from auth import get_current_user
from config import settings
import json

router = APIRouter(prefix="/api", tags=["player"])

@router.get("/broadcast/status", response_model=BroadcastStatusResponse)
async def get_broadcast_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получение текущего статуса вещания"""
    
    status = db.query(BroadcastStatus).first()
    if not status:
        status = BroadcastStatus()
        db.add(status)
        db.commit()
        db.refresh(status)
    
    return status

@router.post("/messages", response_model=SuccessResponse)
async def send_message(
    message_data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Отправка сообщения ведущему"""
    
    print(f"📝 New message from {current_user.login}: {message_data.text}")
    
    message = Message(
        user_id=current_user.id,
        text=message_data.text,
        status='new'
    )
    
    db.add(message)
    db.commit()
    
    print(f"✅ Message saved with ID: {message.id}")
    
    return {"message": "Сообщение отправлено"}

@router.get("/messages", response_model=list[MessageResponse])
async def get_messages(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получение сообщений (для ведущего и админа)"""
    
    # Проверяем роль
    try:
        user_roles = json.loads(current_user.roles) if isinstance(current_user.roles, str) else current_user.roles
    except:
        user_roles = ['user']
    
    query = db.query(Message).join(User).filter(User.deleted_at.is_(None))
    
    # Если не админ и не ведущий, показываем только свои сообщения
    if 'admin' not in user_roles and 'broadcaster' not in user_roles:
        query = query.filter(Message.user_id == current_user.id)
    
    if status:
        query = query.filter(Message.status == status)
    
    messages = query.order_by(Message.created_at.desc()).all()
    
    return [
        MessageResponse(
            id=msg.id,
            user_id=msg.user_id,
            user_login=msg.user.login,
            user_name=msg.user.full_name,
            text=msg.text,
            status=msg.status,
            created_at=msg.created_at
        )
        for msg in messages
    ]

@router.put("/messages/{message_id}/status", response_model=SuccessResponse)
async def update_message_status(
    message_id: int,
    status_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Изменение статуса сообщения (для ведущего)"""
    
    new_status = status_data.get("status")
    if new_status not in ['new', 'in_progress', 'completed']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный статус"
        )
    
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сообщение не найдено"
        )
    
    message.status = new_status
    db.commit()
    
    return {"message": "Статус обновлён"}

@router.post("/voice-messages", response_model=SuccessResponse)
async def send_voice_message(
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Отправка голосового сообщения"""
    
    # Проверка формата
    ext = audio.filename.rsplit('.', 1)[-1].lower() if '.' in audio.filename else ''
    allowed_formats = ['mp3', 'wav', 'ogg', 'webm']
    
    if ext not in allowed_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неподдерживаемый формат"
        )
    
    # Создание папки если не существует
    os.makedirs(settings.voice_messages_folder, exist_ok=True)
    
    # Сохранение файла
    filename = f"voice_{current_user.id}_{datetime.now().timestamp()}.{ext}"
    filepath = os.path.join(settings.voice_messages_folder, filename)
    
    async with aiofiles.open(filepath, 'wb') as out_file:
        content = await audio.read()
        await out_file.write(content)
    
    file_size = os.path.getsize(filepath)
    
    # Сохранение в БД
    voice_message = VoiceMessage(
        user_id=current_user.id,
        file_path=filepath,
        file_size=file_size,
        status='new'
    )
    
    db.add(voice_message)
    db.commit()
    
    return {"message": "Голосовое сообщение отправлено"}
