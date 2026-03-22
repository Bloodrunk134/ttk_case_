from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import asyncio
import json
import time
from database import get_db
from models import BroadcastStatus, MediaLibrary, Playlist, PlaylistItem

router = APIRouter(prefix="/api/stream", tags=["stream"])

@router.get("/broadcast")
async def stream_broadcast(db: Session = Depends(get_db)):
    """SSE stream for real-time broadcast updates"""
    
    async def event_generator():
        last_data = None
        
        while True:
            try:
                status = db.query(BroadcastStatus).first()
                
                event_data = {"timestamp": time.time()}
                
                if status and status.is_broadcasting:
                    event_data["is_broadcasting"] = True
                    event_data["volume"] = status.volume
                    
                    current_track = None
                    if status.current_media_id:
                        media = db.query(MediaLibrary).filter(
                            MediaLibrary.id == status.current_media_id
                        ).first()
                        if media:
                            file_name = media.file_path.split('/')[-1]
                            current_track = {
                                "id": media.id,
                                "name": media.file_name,
                                "type": media.file_type,
                                "url": f"/media/{file_name}"
                            }
                    
                    event_data["current_track"] = current_track
                    
                    playlist_info = None
                    if status.current_playlist_id:
                        playlist = db.query(Playlist).filter(
                            Playlist.id == status.current_playlist_id
                        ).first()
                        if playlist:
                            items_count = db.query(PlaylistItem).filter(
                                PlaylistItem.playlist_id == playlist.id
                            ).count()
                            playlist_info = {
                                "id": playlist.id,
                                "name": playlist.name,
                                "loop_mode": playlist.loop_mode,
                                "shuffle_mode": playlist.shuffle_mode,
                                "total_tracks": items_count,
                                "current_position": status.current_item_index + 1 if status.current_item_index is not None else 0
                            }
                    event_data["current_playlist"] = playlist_info
                else:
                    event_data["is_broadcasting"] = False
                    event_data["current_track"] = None
                    event_data["current_playlist"] = None
                
                current_data_json = json.dumps(event_data, sort_keys=True)
                
                if last_data != current_data_json:
                    yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"
                    last_data = current_data_json
                
                await asyncio.sleep(1)
                
            except Exception as e:
                print(f"Stream error: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                await asyncio.sleep(5)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/test")
async def test_stream():
    """Test endpoint for SSE"""
    
    async def test_generator():
        for i in range(10):
            yield f"data: Test message {i}\n\n"
            await asyncio.sleep(2)
    
    return StreamingResponse(
        test_generator(),
        media_type="text/event-stream"
    )