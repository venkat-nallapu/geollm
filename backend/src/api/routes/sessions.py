"""Session management routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from src.client.session_store import delete_session, get_session, list_sessions, get_messages
from src.models.schemas import MessageSchema, SessionSchema, SessionSummary

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/", response_model=list[SessionSummary])
async def list_all_sessions() -> list[SessionSummary]:
    return await list_sessions()


@router.get("/{session_id}", response_model=SessionSchema)
async def get_session_details(session_id: str) -> SessionSchema:
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    messages = await get_messages(session_id)
    session.messages = messages
    return session


@router.delete("/{session_id}")
async def delete_session_route(session_id: str) -> dict[str, bool]:
    deleted = await delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return {"deleted": True}
