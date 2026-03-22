import asyncio
from typing import Optional

from fastapi import WebSocket
from starlette.websockets import WebSocketState


class MessageRealtimeHub:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, payload: dict) -> None:
        async with self._lock:
            connections = list(self._connections)

        stale_connections: list[WebSocket] = []
        for connection in connections:
            try:
                if connection.client_state != WebSocketState.CONNECTED:
                    stale_connections.append(connection)
                    continue
                await connection.send_json(payload)
            except Exception:
                stale_connections.append(connection)

        if stale_connections:
            async with self._lock:
                for connection in stale_connections:
                    self._connections.discard(connection)


message_realtime_hub = MessageRealtimeHub()


async def notify_messages_changed(
    event_type: str,
    message_id: Optional[int] = None,
    broadcast_id: Optional[int] = None,
) -> None:
    payload = {"type": event_type}
    if message_id is not None:
        payload["message_id"] = message_id
    if broadcast_id is not None:
        payload["broadcast_id"] = broadcast_id
    await message_realtime_hub.broadcast(payload)
