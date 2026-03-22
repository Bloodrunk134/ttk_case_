from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt

from config import settings
from database import SessionLocal
from models import User
from realtime import message_realtime_hub

router = APIRouter(tags=["realtime"])


def _authenticate_websocket_user(token: str) -> User | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = payload.get("user_id")
        if user_id is None:
            return None
    except JWTError:
        return None

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
        return user
    finally:
        db.close()


@router.websocket("/ws/messages")
async def message_events_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = _authenticate_websocket_user(token)
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await message_realtime_hub.connect(websocket)
    await websocket.send_json({"type": "connected", "user_id": user.id})

    try:
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await message_realtime_hub.disconnect(websocket)
    except Exception:
        await message_realtime_hub.disconnect(websocket)
