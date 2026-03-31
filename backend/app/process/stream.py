import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import WebSocket


async def stream_to_websocket(
    websocket: WebSocket,
    lines: AsyncIterator[str],
    tool_name: str = "",
) -> None:
    """Forward text lines from a tool to a WebSocket connection.

    Each line is wrapped in the standard WSEvent envelope and sent as JSON.

    Args:
        websocket: The FastAPI WebSocket connection.
        lines: Async iterator of text lines from a tool wrapper.
        tool_name: Name of the binary producing the output (for the ``tool`` field).
    """
    async for line in lines:
        if not line.strip():
            continue
        event = {
            "type": "output",
            "message": line,
            "tool": tool_name,
        }
        try:
            await websocket.send_text(json.dumps(event))
        except Exception:
            break


async def send_event(websocket: WebSocket, event: dict) -> bool:
    """Send a single WSEvent dict to *websocket*.

    Returns:
        False if the connection was closed before the send.
    """
    try:
        await websocket.send_text(json.dumps(event))
        return True
    except Exception:
        return False


async def broadcast_lines(
    websockets: list[WebSocket],
    lines: AsyncIterator[str],
    tool_name: str = "",
) -> None:
    """Send lines from a tool to multiple WebSocket connections."""
    async for line in lines:
        if not line.strip():
            continue
        event = json.dumps({"type": "output", "message": line, "tool": tool_name})
        dead = []
        for ws in websockets:
            try:
                await ws.send_text(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            websockets.remove(ws)
