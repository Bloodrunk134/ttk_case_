from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import datetime
import os
import aiofiles
from typing import Optional
from database import get_db
from models import User, Message, BroadcastStatus, VoiceMessage, BroadcastChannel
from schemas import (
    MessageCreate, MessageResponse, BroadcastStatusResponse,
    MessageStatusUpdate, SuccessResponse, VoiceMessageListResponse,
    VoiceMessageStatusUpdate, BroadcastChannelResponse
)
from auth import get_current_user, role_required
from config import settings
from realtime import notify_messages_changed

router = APIRouter(prefix="/api", tags=["player"])


def client_to_db_voice_status(status_value: str) -> str:
    return "listened" if status_value == "in_progress" else status_value


def db_to_client_voice_status(status_value: str) -> str:
    return "in_progress" if status_value == "listened" else status_value


def media_path_to_public_url(file_path: Optional[str]) -> Optional[str]:
    if not file_path:
        return None

    normalized = file_path.replace("\\", "/")
    recordings_folder = settings.presenter_recordings_folder.replace("\\", "/")

    if normalized.startswith(recordings_folder) or f"/{recordings_folder}/" in normalized:
        return f"/recordings/{os.path.basename(file_path)}"

    return f"/media/{os.path.basename(file_path)}"


def channel_to_response(channel: BroadcastChannel) -> BroadcastChannelResponse:
    current_url = channel.current_media_url
    if not current_url and channel.current_media is not None:
        current_url = media_path_to_public_url(channel.current_media.file_path)

    return BroadcastChannelResponse(
        id=channel.id,
        user_id=channel.user_id,
        user_login=channel.user.login if channel.user else None,
        user_name=channel.user.full_name if channel.user else None,
        name=channel.name,
        playlist_id=channel.playlist_id,
        is_live=bool(channel.is_live),
        current_media_id=channel.current_media_id,
        current_media_type=channel.current_media_type,
        current_media_title=channel.current_media_title,
        current_media_url=current_url,
        volume=channel.volume or 80,
        created_at=channel.created_at,
        updated_at=channel.updated_at,
    )


def is_staff(user: User) -> bool:
    try:
        roles = user.get_roles()
    except Exception:
        roles = ["user"]
    return "admin" in roles or "broadcaster" in roles


def resolve_channel_for_chat(
    db: Session,
    broadcast_id: int,
    *,
    require_live: bool = False,
) -> BroadcastChannel:
    query = (
        db.query(BroadcastChannel)
        .join(User, BroadcastChannel.user_id == User.id)
        .filter(BroadcastChannel.id == broadcast_id, User.deleted_at.is_(None))
    )
    if require_live:
        query = query.filter(BroadcastChannel.is_live.is_(True))

    channel = query.first()
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Broadcast not found" if not require_live else "Broadcast is not active",
        )

    return channel

@router.post("/messages", response_model=SuccessResponse)
async def send_message(
    message_data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a text message to the broadcaster."""

    if not message_data.broadcast_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="broadcast_id is required",
        )

    channel = resolve_channel_for_chat(db, message_data.broadcast_id, require_live=True)

    message = Message(
        user_id=current_user.id,
        channel_id=channel.id,
        text=message_data.text,
        status='new'
    )
    
    db.add(message)
    db.commit()
    db.refresh(message)
    await notify_messages_changed("message_created", message.id, broadcast_id=message.channel_id)
    
    return {"message": "Message sent"}

@router.get("/messages", response_model=list[MessageResponse])
async def get_messages(
    status: Optional[str] = None,
    broadcast_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get messages visible for current user."""

    query = db.query(Message).join(User, Message.user_id == User.id).filter(User.deleted_at.is_(None))

    # Non-admin/non-broadcaster users can only see their own messages.
    if not is_staff(current_user):
        query = query.filter(Message.user_id == current_user.id)

    if broadcast_id is not None:
        query = query.filter(Message.channel_id == broadcast_id)

    if status:
        query = query.filter(Message.status == status)

    messages = query.order_by(Message.created_at.desc()).all()

    return [
        MessageResponse(
            id=msg.id,
            user_id=msg.user_id,
            broadcast_id=msg.channel_id,
            broadcast_name=msg.channel.name if msg.channel else None,
            user_login=msg.user.login,
            user_name=msg.user.full_name,
            text=msg.text,
            status=msg.status,
            response_text=msg.response_text,
            responded_by=msg.responded_by,
            responded_at=msg.responded_at,
            created_at=msg.created_at
        )
        for msg in messages
    ]

@router.put("/messages/{message_id}/status", response_model=SuccessResponse)
async def update_message_status(
    message_id: int,
    status_data: MessageStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Update message status (broadcaster/admin only)."""
    
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    message.status = status_data.status
    
    # Persist broadcaster response text when provided.
    if status_data.response_text:
        message.response_text = status_data.response_text
        message.responded_by = current_user.id
        message.responded_at = datetime.now()

    db.commit()
    await notify_messages_changed("message_updated", message.id, broadcast_id=message.channel_id)
    
    return {"message": "Status updated"}

@router.post("/voice-messages", response_model=SuccessResponse)
async def send_voice_message(
    audio: UploadFile = File(...),
    broadcast_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a voice message."""

    if not broadcast_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="broadcast_id is required",
        )

    channel = resolve_channel_for_chat(db, broadcast_id, require_live=True)

    ext = audio.filename.rsplit('.', 1)[-1].lower() if '.' in audio.filename else ''
    allowed_formats = ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'mp4']
    
    if ext not in allowed_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported format"
        )
    
    os.makedirs(settings.voice_messages_folder, exist_ok=True)
    
    filename = f"voice_{current_user.id}_{datetime.now().timestamp()}.{ext}"
    filepath = os.path.join(settings.voice_messages_folder, filename)
    
    async with aiofiles.open(filepath, 'wb') as out_file:
        content = await audio.read()
        await out_file.write(content)
    
    file_size = os.path.getsize(filepath)
    
    voice_message = VoiceMessage(
        user_id=current_user.id,
        channel_id=channel.id,
        file_path=filepath,
        file_size=file_size,
        status='new'
    )
    
    db.add(voice_message)
    db.commit()
    db.refresh(voice_message)
    await notify_messages_changed("voice_message_created", voice_message.id, broadcast_id=voice_message.channel_id)
    
    return {"message": "Voice message sent"}

@router.get("/voice-messages", response_model=list[VoiceMessageListResponse])
async def get_voice_messages(
    status: Optional[str] = None,
    broadcast_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get voice messages visible for current user."""

    query = db.query(VoiceMessage).join(User, VoiceMessage.user_id == User.id).filter(User.deleted_at.is_(None))

    if not is_staff(current_user):
        query = query.filter(VoiceMessage.user_id == current_user.id)

    if broadcast_id is not None:
        query = query.filter(VoiceMessage.channel_id == broadcast_id)

    if status:
        query = query.filter(VoiceMessage.status == client_to_db_voice_status(status))

    voice_messages = query.order_by(VoiceMessage.created_at.desc()).all()

    return [
        VoiceMessageListResponse(
            id=item.id,
            user_id=item.user_id,
            broadcast_id=item.channel_id,
            broadcast_name=item.channel.name if item.channel else None,
            user_login=item.user.login,
            user_name=item.user.full_name,
            file_url=f"/voice_messages/{os.path.basename(item.file_path)}",
            file_size=item.file_size,
            duration=item.duration,
            status=db_to_client_voice_status(item.status),
            response_text=item.response_text,
            responded_by=item.responded_by,
            responded_at=item.responded_at,
            created_at=item.created_at
        )
        for item in voice_messages
    ]

@router.put("/voice-messages/{voice_message_id}/status", response_model=SuccessResponse)
async def update_voice_message_status(
    voice_message_id: int,
    status_data: VoiceMessageStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"]))
):
    """Update voice message status (broadcaster/admin only)."""

    voice_message = db.query(VoiceMessage).filter(VoiceMessage.id == voice_message_id).first()
    if not voice_message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice message not found"
        )

    voice_message.status = client_to_db_voice_status(status_data.status)

    if status_data.response_text:
        voice_message.response_text = status_data.response_text
        voice_message.responded_by = current_user.id
        voice_message.responded_at = datetime.now()

    db.commit()
    await notify_messages_changed("voice_message_updated", voice_message.id, broadcast_id=voice_message.channel_id)

    return {"message": "Voice message status updated"}


@router.get("/broadcasts", response_model=list[BroadcastChannelResponse])
async def get_broadcasts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get active broadcast channels for player selection."""

    channels = (
        db.query(BroadcastChannel)
        .join(User, BroadcastChannel.user_id == User.id)
        .filter(User.deleted_at.is_(None), BroadcastChannel.is_live.is_(True))
        .order_by(BroadcastChannel.updated_at.desc().nulls_last(), BroadcastChannel.id.desc())
        .all()
    )

    return [channel_to_response(channel) for channel in channels]

@router.get("/broadcast/status", response_model=BroadcastStatusResponse)
async def get_broadcast_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current broadcast status."""
    
    status_row = db.query(BroadcastStatus).first()
    if not status_row:
        status_row = BroadcastStatus()
        db.add(status_row)
        db.commit()
        db.refresh(status_row)

    live_channel = (
        db.query(BroadcastChannel)
        .filter(BroadcastChannel.is_live.is_(True))
        .order_by(BroadcastChannel.updated_at.desc().nulls_last(), BroadcastChannel.id.desc())
        .first()
    )

    if live_channel:
        status_row.is_broadcasting = True
        status_row.current_media_id = live_channel.current_media_id
        status_row.current_media_type = live_channel.current_media_type
        status_row.volume = live_channel.volume or status_row.volume
    else:
        status_row.is_broadcasting = False

    db.commit()
    db.refresh(status_row)

    return status_row
