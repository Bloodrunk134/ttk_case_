from datetime import datetime
import os
import random
from typing import List, Optional

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from auth import role_required
from config import settings
from database import get_db
from models import (
    BroadcastChannel,
    BroadcastStatus,
    MediaLibrary,
    Playlist,
    PlaylistItem,
    PresenterRecording,
    User,
)
from realtime import notify_messages_changed
from schemas import (
    BroadcastChannelCreate,
    BroadcastChannelResponse,
    BroadcastChannelStart,
    BroadcastChannelUpdate,
    BroadcastControl,
    BroadcastStatusResponse,
    MediaResponse,
    PlaylistCreate,
    PlaylistItemCreate,
    PlaylistItemResponse,
    PlaylistModesUpdate,
    PlaylistResponse,
    SuccessResponse,
)

router = APIRouter(prefix="/api/broadcaster", tags=["broadcaster"])


def _path_to_public_url(file_path: Optional[str]) -> Optional[str]:
    if not file_path:
        return None

    normalized = file_path.replace("\\", "/")
    recordings_folder = settings.presenter_recordings_folder.replace("\\", "/")

    if normalized.startswith(recordings_folder) or f"/{recordings_folder}/" in normalized:
        return f"/recordings/{os.path.basename(file_path)}"

    return f"/media/{os.path.basename(file_path)}"


def _channel_to_response(channel: BroadcastChannel) -> BroadcastChannelResponse:
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
        current_media_url=channel.current_media_url,
        volume=channel.volume or 80,
        created_at=channel.created_at,
        updated_at=channel.updated_at,
    )


def _get_owned_playlist(db: Session, user_id: int, playlist_id: int) -> Playlist:
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id, Playlist.user_id == user_id).first()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    return playlist


def _get_owned_channel(db: Session, user_id: int, channel_id: int) -> BroadcastChannel:
    channel = db.query(BroadcastChannel).filter(BroadcastChannel.id == channel_id, BroadcastChannel.user_id == user_id).first()
    if not channel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Broadcast channel not found")
    return channel


def _first_playlist_item(db: Session, playlist_id: int) -> Optional[PlaylistItem]:
    return (
        db.query(PlaylistItem)
        .join(MediaLibrary, PlaylistItem.media_id == MediaLibrary.id)
        .filter(PlaylistItem.playlist_id == playlist_id)
        .order_by(PlaylistItem.position.asc())
        .first()
    )


def _playlist_items(db: Session, playlist_id: int) -> list[PlaylistItem]:
    return (
        db.query(PlaylistItem)
        .join(MediaLibrary, PlaylistItem.media_id == MediaLibrary.id)
        .filter(PlaylistItem.playlist_id == playlist_id)
        .order_by(PlaylistItem.position.asc())
        .all()
    )


def _next_playlist_item(db: Session, playlist: Playlist, current_media_id: Optional[int]) -> Optional[PlaylistItem]:
    items = _playlist_items(db, playlist.id)
    if not items:
        return None

    if playlist.shuffle_mode:
        shuffled_pool = [item for item in items if item.media_id != current_media_id]
        if not shuffled_pool:
            shuffled_pool = items
        return random.choice(shuffled_pool)

    current_index = -1
    for index, item in enumerate(items):
        if item.media_id == current_media_id:
            current_index = index
            break

    if current_index == -1:
        return items[0]

    next_index = current_index + 1
    if next_index >= len(items):
        if playlist.loop_mode:
            next_index = 0
        else:
            return None

    return items[next_index]


def _apply_media_to_channel(channel: BroadcastChannel, media: MediaLibrary) -> None:
    channel.current_media_id = media.id
    channel.current_media_type = media.file_type
    channel.current_media_title = media.file_name
    channel.current_media_url = _path_to_public_url(media.file_path)


def _clear_channel_media(channel: BroadcastChannel) -> None:
    channel.current_media_id = None
    channel.current_media_type = None
    channel.current_media_title = None
    channel.current_media_url = None


# =============================================
# Media Library
# =============================================


@router.post("/media/upload", response_model=SuccessResponse)
async def upload_media(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""

    if ext in settings.allowed_audio_formats:
        file_type = "audio"
        max_size = settings.max_audio_size
    elif ext in settings.allowed_video_formats:
        file_type = "video"
        max_size = settings.max_video_size
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format. Allowed: {settings.allowed_audio_formats + settings.allowed_video_formats}",
        )

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum {max_size // (1024 * 1024)} MB",
        )

    os.makedirs(settings.upload_folder, exist_ok=True)
    filename = f"{current_user.id}_{datetime.now().timestamp()}_{file.filename}"
    filepath = os.path.join(settings.upload_folder, filename)

    async with aiofiles.open(filepath, "wb") as out_file:
        content = await file.read()
        await out_file.write(content)

    media = MediaLibrary(
        user_id=current_user.id,
        file_name=file.filename,
        file_path=filepath,
        file_type=file_type,
        file_format=ext,
        file_size=file_size,
    )

    db.add(media)
    db.commit()

    return {"message": "File uploaded"}


@router.get("/media", response_model=List[MediaResponse])
async def get_media(
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    media = (
        db.query(MediaLibrary)
        .filter(MediaLibrary.user_id == current_user.id)
        .order_by(MediaLibrary.created_at.desc())
        .all()
    )

    return [
        MediaResponse(
            id=item.id,
            file_name=item.file_name,
            file_type=item.file_type,
            file_format=item.file_format,
            file_size=item.file_size,
            duration=item.duration,
            created_at=item.created_at,
        )
        for item in media
    ]


@router.delete("/media/{media_id}", response_model=SuccessResponse)
async def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    media = (
        db.query(MediaLibrary)
        .filter(MediaLibrary.id == media_id, MediaLibrary.user_id == current_user.id)
        .first()
    )

    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    if os.path.exists(media.file_path):
        os.remove(media.file_path)

    db.delete(media)
    db.commit()

    return {"message": "File deleted"}


# =============================================
# Playlists
# =============================================


@router.get("/playlists", response_model=List[PlaylistResponse])
async def get_playlists(
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    playlists = (
        db.query(Playlist)
        .filter(Playlist.user_id == current_user.id)
        .order_by(Playlist.created_at.desc())
        .all()
    )

    return [
        PlaylistResponse(
            id=playlist.id,
            name=playlist.name,
            is_active=playlist.is_active,
            loop_mode=playlist.loop_mode,
            shuffle_mode=playlist.shuffle_mode,
            created_at=playlist.created_at,
        )
        for playlist in playlists
    ]


@router.post("/playlists", response_model=PlaylistResponse)
async def create_playlist(
    playlist_data: PlaylistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    playlist = Playlist(user_id=current_user.id, name=playlist_data.name)

    db.add(playlist)
    db.commit()
    db.refresh(playlist)

    return PlaylistResponse(
        id=playlist.id,
        name=playlist.name,
        is_active=playlist.is_active,
        loop_mode=playlist.loop_mode,
        shuffle_mode=playlist.shuffle_mode,
        created_at=playlist.created_at,
    )


@router.put("/playlists/{playlist_id}/activate", response_model=SuccessResponse)
async def activate_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    playlist = _get_owned_playlist(db, current_user.id, playlist_id)
    playlist.is_active = True
    db.commit()
    return {"message": "Playlist activated"}


@router.put("/playlists/{playlist_id}/modes", response_model=SuccessResponse)
async def update_playlist_modes(
    playlist_id: int,
    modes: PlaylistModesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    playlist = _get_owned_playlist(db, current_user.id, playlist_id)

    if modes.loop_mode is not None:
        playlist.loop_mode = modes.loop_mode

    if modes.shuffle_mode is not None:
        playlist.shuffle_mode = modes.shuffle_mode

    db.commit()

    return {"message": "Playlist modes updated"}


@router.post("/playlists/{playlist_id}/items", response_model=PlaylistItemResponse)
async def add_playlist_item(
    playlist_id: int,
    item_data: PlaylistItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    _get_owned_playlist(db, current_user.id, playlist_id)

    media = (
        db.query(MediaLibrary)
        .filter(MediaLibrary.id == item_data.media_id, MediaLibrary.user_id == current_user.id)
        .first()
    )

    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found")

    if item_data.position is None:
        position = db.query(PlaylistItem).filter(PlaylistItem.playlist_id == playlist_id).count() + 1
    else:
        position = item_data.position

    playlist_item = PlaylistItem(playlist_id=playlist_id, media_id=item_data.media_id, position=position)

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
            created_at=media.created_at,
        ),
    )


@router.get("/playlists/{playlist_id}/items", response_model=List[PlaylistItemResponse])
async def get_playlist_items(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    _get_owned_playlist(db, current_user.id, playlist_id)

    items = (
        db.query(PlaylistItem)
        .join(MediaLibrary, PlaylistItem.media_id == MediaLibrary.id)
        .filter(PlaylistItem.playlist_id == playlist_id)
        .order_by(PlaylistItem.position.asc())
        .all()
    )

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
                created_at=item.media.created_at,
            ),
        )
        for item in items
    ]


@router.delete("/playlists/items/{item_id}", response_model=SuccessResponse)
async def delete_playlist_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    item = (
        db.query(PlaylistItem)
        .join(Playlist, Playlist.id == PlaylistItem.playlist_id)
        .filter(PlaylistItem.id == item_id, Playlist.user_id == current_user.id)
        .first()
    )

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist item not found")

    db.delete(item)
    db.commit()

    return {"message": "Playlist item deleted"}


@router.delete("/playlists/{playlist_id}/clear", response_model=SuccessResponse)
async def clear_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    _get_owned_playlist(db, current_user.id, playlist_id)

    db.query(PlaylistItem).filter(PlaylistItem.playlist_id == playlist_id).delete()
    db.commit()

    return {"message": "Playlist cleared"}


# =============================================
# Broadcast Channels
# =============================================


@router.get("/channels", response_model=List[BroadcastChannelResponse])
async def get_channels(
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    channels = (
        db.query(BroadcastChannel)
        .filter(BroadcastChannel.user_id == current_user.id)
        .order_by(BroadcastChannel.created_at.asc())
        .all()
    )

    if not channels:
        default_channel = BroadcastChannel(user_id=current_user.id, name="Main Air")
        db.add(default_channel)
        db.commit()
        db.refresh(default_channel)
        channels = [default_channel]

    return [_channel_to_response(channel) for channel in channels]


@router.post("/channels", response_model=BroadcastChannelResponse)
async def create_channel(
    data: BroadcastChannelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    if data.playlist_id is not None:
        _get_owned_playlist(db, current_user.id, data.playlist_id)

    channel = BroadcastChannel(
        user_id=current_user.id,
        name=data.name,
        playlist_id=data.playlist_id,
        volume=data.volume or 80,
    )

    db.add(channel)
    db.commit()
    db.refresh(channel)

    return _channel_to_response(channel)


@router.put("/channels/{channel_id}", response_model=BroadcastChannelResponse)
async def update_channel(
    channel_id: int,
    data: BroadcastChannelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    channel = _get_owned_channel(db, current_user.id, channel_id)

    payload = data.model_dump(exclude_unset=True)

    if "name" in payload:
        channel.name = payload["name"]

    if "playlist_id" in payload:
        playlist_id = payload["playlist_id"]
        if playlist_id is not None:
            _get_owned_playlist(db, current_user.id, playlist_id)
        channel.playlist_id = playlist_id

    if "volume" in payload and payload["volume"] is not None:
        channel.volume = payload["volume"]

    db.commit()
    db.refresh(channel)

    await notify_messages_changed("broadcast_updated", channel.id)

    return _channel_to_response(channel)


@router.post("/channels/{channel_id}/start", response_model=SuccessResponse)
async def start_channel(
    channel_id: int,
    data: BroadcastChannelStart,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    channel = _get_owned_channel(db, current_user.id, channel_id)

    if data.playlist_id is not None:
        _get_owned_playlist(db, current_user.id, data.playlist_id)
        channel.playlist_id = data.playlist_id

    if not channel.playlist_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a playlist before starting")

    playlist = _get_owned_playlist(db, current_user.id, channel.playlist_id)
    first_item = _first_playlist_item(db, playlist.id)

    if not first_item:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected playlist is empty")

    channel.is_live = True
    _apply_media_to_channel(channel, first_item.media)

    db.commit()

    await notify_messages_changed("broadcast_updated", channel.id)

    return {"message": "Broadcast started"}


@router.post("/channels/{channel_id}/stop", response_model=SuccessResponse)
async def stop_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    channel = _get_owned_channel(db, current_user.id, channel_id)
    channel.is_live = False

    db.commit()

    await notify_messages_changed("broadcast_updated", channel.id)

    return {"message": "Broadcast stopped"}


@router.post("/channels/{channel_id}/next", response_model=SuccessResponse)
async def play_next(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    channel = _get_owned_channel(db, current_user.id, channel_id)

    if not channel.playlist_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Channel has no playlist")

    playlist = _get_owned_playlist(db, current_user.id, channel.playlist_id)
    next_item = _next_playlist_item(db, playlist, channel.current_media_id)

    if not next_item:
        channel.is_live = False
        _clear_channel_media(channel)
        db.commit()
        await notify_messages_changed("broadcast_updated", channel.id)
        return {"message": "Playlist finished. Broadcast stopped"}

    channel.is_live = True
    _apply_media_to_channel(channel, next_item.media)

    db.commit()

    await notify_messages_changed("broadcast_updated", channel.id)

    return {"message": "Switched to next track"}


# =============================================
# Legacy Broadcast Status (kept for compatibility)
# =============================================


@router.get("/broadcast", response_model=BroadcastStatusResponse)
async def get_broadcast_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    status_row = db.query(BroadcastStatus).first()
    if not status_row:
        status_row = BroadcastStatus()
        db.add(status_row)
        db.commit()
        db.refresh(status_row)

    live_channel = (
        db.query(BroadcastChannel)
        .filter(BroadcastChannel.user_id == current_user.id, BroadcastChannel.is_live.is_(True))
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


@router.put("/broadcast", response_model=SuccessResponse)
async def control_broadcast(
    control: BroadcastControl,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    channel = (
        db.query(BroadcastChannel)
        .filter(BroadcastChannel.user_id == current_user.id)
        .order_by(BroadcastChannel.created_at.asc())
        .first()
    )

    if not channel:
        channel = BroadcastChannel(user_id=current_user.id, name="Main Air")
        db.add(channel)
        db.commit()
        db.refresh(channel)

    if control.volume is not None:
        channel.volume = control.volume

    if control.current_media_id is not None:
        media = (
            db.query(MediaLibrary)
            .filter(MediaLibrary.id == control.current_media_id, MediaLibrary.user_id == current_user.id)
            .first()
        )
        if not media:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found")
        _apply_media_to_channel(channel, media)

    if control.current_media_type is not None:
        channel.current_media_type = control.current_media_type

    if control.is_broadcasting is not None:
        channel.is_live = control.is_broadcasting

    db.commit()

    await notify_messages_changed("broadcast_updated", channel.id)

    return {"message": "Broadcast updated"}


# =============================================
# Presenter Recordings
# =============================================


@router.post("/record", response_model=SuccessResponse)
async def record_audio(
    audio: UploadFile = File(...),
    channel_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["broadcaster", "admin"])),
):
    os.makedirs(settings.presenter_recordings_folder, exist_ok=True)

    ext = audio.filename.rsplit(".", 1)[-1].lower() if audio.filename and "." in audio.filename else "webm"
    if ext not in ["mp3", "wav", "ogg", "webm", "m4a", "mp4"]:
        ext = "webm"

    filename = f"recording_{current_user.id}_{datetime.now().timestamp()}.{ext}"
    filepath = os.path.join(settings.presenter_recordings_folder, filename)

    async with aiofiles.open(filepath, "wb") as out_file:
        content = await audio.read()
        await out_file.write(content)

    file_size = os.path.getsize(filepath)

    recording = PresenterRecording(
        user_id=current_user.id,
        file_path=filepath,
        file_name=filename,
        file_size=file_size,
    )
    db.add(recording)

    channel_for_live: Optional[BroadcastChannel] = None

    if channel_id is not None:
        channel_for_live = _get_owned_channel(db, current_user.id, channel_id)
    else:
        channel_for_live = (
            db.query(BroadcastChannel)
            .filter(BroadcastChannel.user_id == current_user.id, BroadcastChannel.is_live.is_(True))
            .order_by(BroadcastChannel.updated_at.desc().nulls_last(), BroadcastChannel.id.desc())
            .first()
        )

    if channel_for_live:
        channel_for_live.is_live = True
        channel_for_live.current_media_id = None
        channel_for_live.current_media_type = "audio"
        channel_for_live.current_media_title = "Presenter live recording"
        channel_for_live.current_media_url = f"/recordings/{filename}"

    db.commit()

    if channel_for_live:
        await notify_messages_changed("broadcast_updated", channel_for_live.id)
        return {"message": "Recording saved and sent to broadcast"}

    return {"message": "Recording saved"}
