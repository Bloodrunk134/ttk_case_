from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, List
import os
import aiofiles
from datetime import datetime
from database import get_db
from models import (
    User, MediaLibrary, Playlist, PlaylistItem, 
    BroadcastStatus, PresenterRecording
)
from schemas import (
    MediaResponse, PlaylistCreate, PlaylistResponse,
    PlaylistModesUpdate, PlaylistItemCreate, PlaylistItemResponse,
    BroadcastStatusResponse, BroadcastControl, SuccessResponse, ErrorResponse
)
from auth import role_required
from config import settings

router = APIRouter(prefix="/api/broadcaster", tags=["broadcaster"])

# =============================================
# Media Library
# =============================================

@router.post("/media/upload", response_model=SuccessResponse)
async def upload_media(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Загрузка файла в медиатеку"""
    
    # Определение типа файла
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    
    if ext in settings.allowed_audio_formats:
        file_type = 'audio'
        max_size = settings.max_audio_size
    elif ext in settings.allowed_video_formats:
        file_type = 'video'
        max_size = settings.max_video_size
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неподдерживаемый формат. Разрешены: {settings.allowed_audio_formats + settings.allowed_video_formats}"
        )
    
    # Проверка размера
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Файл слишком большой. Максимум {max_size // (1024*1024)} МБ"
        )
    
    # Создание папки
    os.makedirs(settings.upload_folder, exist_ok=True)
    
    # Сохранение файла
    filename = f"{current_user.id}_{datetime.now().timestamp()}_{file.filename}"
    filepath = os.path.join(settings.upload_folder, filename)
    
    async with aiofiles.open(filepath, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    # Сохранение в БД
    media = MediaLibrary(
        user_id=current_user.id,
        file_name=file.filename,
        file_path=filepath,
        file_type=file_type,
        file_format=ext,
        file_size=file_size
    )
    
    db.add(media)
    db.commit()
    db.refresh(media)
    
    return {"message": "Файл загружен"}

@router.get("/media", response_model=List[MediaResponse])
async def get_media(
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Получение медиатеки"""
    
    media = db.query(MediaLibrary).filter(
        MediaLibrary.user_id == current_user.id
    ).order_by(MediaLibrary.created_at.desc()).all()
    
    return [
        MediaResponse(
            id=m.id,
            file_name=m.file_name,
            file_type=m.file_type,
            file_format=m.file_format,
            file_size=m.file_size,
            duration=m.duration,
            created_at=m.created_at
        )
        for m in media
    ]

@router.delete("/media/{media_id}", response_model=SuccessResponse)
async def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Удаление файла из медиатеки"""
    
    media = db.query(MediaLibrary).filter(
        MediaLibrary.id == media_id,
        MediaLibrary.user_id == current_user.id
    ).first()
    
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Файл не найден"
        )
    
    # Удаление файла
    if os.path.exists(media.file_path):
        os.remove(media.file_path)
    
    db.delete(media)
    db.commit()
    
    return {"message": "Файл удалён"}

# =============================================
# Playlists
# =============================================

@router.get("/playlists", response_model=List[PlaylistResponse])
async def get_playlists(
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Получение всех плейлистов"""
    
    playlists = db.query(Playlist).filter(
        Playlist.user_id == current_user.id
    ).order_by(Playlist.created_at.desc()).all()
    
    return [
        PlaylistResponse(
            id=p.id,
            name=p.name,
            is_active=p.is_active,
            loop_mode=p.loop_mode,
            shuffle_mode=p.shuffle_mode,
            created_at=p.created_at
        )
        for p in playlists
    ]

@router.post("/playlists", response_model=PlaylistResponse)
async def create_playlist(
    playlist_data: PlaylistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Создание плейлиста"""
    
    playlist = Playlist(
        user_id=current_user.id,
        name=playlist_data.name
    )
    
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    
    return PlaylistResponse(
        id=playlist.id,
        name=playlist.name,
        is_active=playlist.is_active,
        loop_mode=playlist.loop_mode,
        shuffle_mode=playlist.shuffle_mode,
        created_at=playlist.created_at
    )

@router.put("/playlists/{playlist_id}/activate", response_model=SuccessResponse)
async def activate_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Активация плейлиста (триггер сам деактивирует другие)"""
    
    playlist = db.query(Playlist).filter(
        Playlist.id == playlist_id,
        Playlist.user_id == current_user.id
    ).first()
    
    if not playlist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Плейлист не найден"
        )
    
    playlist.is_active = True
    db.commit()
    
    return {"message": "Плейлист активирован"}

@router.put("/playlists/{playlist_id}/modes", response_model=SuccessResponse)
async def update_playlist_modes(
    playlist_id: int,
    modes: PlaylistModesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Обновление режимов плейлиста"""
    
    playlist = db.query(Playlist).filter(
        Playlist.id == playlist_id,
        Playlist.user_id == current_user.id
    ).first()
    
    if not playlist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Плейлист не найден"
        )
    
    if modes.loop_mode is not None:
        playlist.loop_mode = modes.loop_mode
    
    if modes.shuffle_mode is not None:
        playlist.shuffle_mode = modes.shuffle_mode
    
    db.commit()
    
    return {"message": "Режимы обновлены"}

@router.post("/playlists/{playlist_id}/items", response_model=PlaylistItemResponse)
async def add_playlist_item(
    playlist_id: int,
    item_data: PlaylistItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Добавление элемента в плейлист"""
    
    # Проверка существования плейлиста
    playlist = db.query(Playlist).filter(
        Playlist.id == playlist_id,
        Playlist.user_id == current_user.id
    ).first()
    
    if not playlist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Плейлист не найден"
        )
    
    # Проверка существования медиафайла
    media = db.query(MediaLibrary).filter(
        MediaLibrary.id == item_data.media_id,
        MediaLibrary.user_id == current_user.id
    ).first()
    
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Медиафайл не найден"
        )
    
    # Определение позиции
    if item_data.position is None:
        max_position = db.query(PlaylistItem).filter(
            PlaylistItem.playlist_id == playlist_id
        ).count()
        position = max_position + 1
    else:
        position = item_data.position
    
    playlist_item = PlaylistItem(
        playlist_id=playlist_id,
        media_id=item_data.media_id,
        position=position
    )
    
    db.add(playlist_item)
    db.commit()
    db.refresh(playlist_item)
    
    return PlaylistItemResponse(
        id=playlist_item.id,
        position=playlist_item.position,
        media=MediaResponse(
            id=media.id,
            file_name=media.file_name,
            file_type=media.file_type,
            file_format=media.file_format,
            file_size=media.file_size,
            duration=media.duration,
            created_at=media.created_at
        )
    )

@router.get("/playlists/{playlist_id}/items", response_model=List[PlaylistItemResponse])
async def get_playlist_items(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Получение элементов плейлиста"""
    
    items = db.query(PlaylistItem).join(MediaLibrary).filter(
        PlaylistItem.playlist_id == playlist_id,
        MediaLibrary.user_id == current_user.id
    ).order_by(PlaylistItem.position).all()
    
    return [
        PlaylistItemResponse(
            id=item.id,
            position=item.position,
            media=MediaResponse(
                id=item.media.id,
                file_name=item.media.file_name,
                file_type=item.media.file_type,
                file_format=item.media.file_format,
                file_size=item.media.file_size,
                duration=item.media.duration,
                created_at=item.media.created_at
            )
        )
        for item in items
    ]

@router.delete("/playlists/{playlist_id}/clear", response_model=SuccessResponse)
async def clear_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Очистка плейлиста"""
    
    db.query(PlaylistItem).filter(PlaylistItem.playlist_id == playlist_id).delete()
    db.commit()
    
    return {"message": "Плейлист очищен"}

# =============================================
# Broadcast Control
# =============================================

@router.get("/broadcast", response_model=BroadcastStatusResponse)
async def get_broadcast_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Получение статуса вещания"""
    
    status = db.query(BroadcastStatus).first()
    if not status:
        status = BroadcastStatus()
        db.add(status)
        db.commit()
        db.refresh(status)
    
    return status

@router.put("/broadcast", response_model=SuccessResponse)
async def control_broadcast(
    control: BroadcastControl,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Управление эфиром"""
    
    status = db.query(BroadcastStatus).first()
    if not status:
        status = BroadcastStatus()
        db.add(status)
    
    if control.is_broadcasting is not None:
        status.is_broadcasting = control.is_broadcasting
    
    if control.volume is not None:
        status.volume = control.volume
    
    if control.is_video_mode is not None:
        status.is_video_mode = control.is_video_mode
    
    if control.current_media_id is not None:
        status.current_media_id = control.current_media_id
    
    if control.current_media_type is not None:
        status.current_media_type = control.current_media_type
    
    db.commit()
    
    return {"message": "Статус эфира обновлён"}

# =============================================
# Presenter Recordings
# =============================================

@router.post("/record", response_model=SuccessResponse)
async def record_audio(
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['broadcaster', 'admin']))
):
    """Запись аудио с микрофона ведущего"""
    
    # Создание папки
    os.makedirs(settings.presenter_recordings_folder, exist_ok=True)
    
    # Сохранение записи
    filename = f"recording_{current_user.id}_{datetime.now().timestamp()}.mp3"
    filepath = os.path.join(settings.presenter_recordings_folder, filename)
    
    async with aiofiles.open(filepath, 'wb') as out_file:
        content = await audio.read()
        await out_file.write(content)
    
    file_size = os.path.getsize(filepath)
    
    recording = PresenterRecording(
        user_id=current_user.id,
        file_path=filepath,
        file_name=filename,
        file_size=file_size
    )
    
    db.add(recording)
    db.commit()
    
    return {"message": "Запись сохранена"}