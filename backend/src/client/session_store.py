"""
client/session_store.py
Async SQLite-backed session and message persistence using SQLAlchemy 2.0.
"""

from __future__ import annotations

from pathlib import Path

from loguru import logger
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models.schemas import Base, MessageORM, SessionORM
from src.utils.config import cfg


def _get_engine():
    db_url = cfg("database", "url", default="sqlite+aiosqlite:///./data/geollm.db")
    Path("data").mkdir(exist_ok=True)
    return create_async_engine(db_url, echo=False, future=True)


_engine = None
_session_factory = None


def get_session_factory() -> async_sessionmaker:
    global _engine, _session_factory
    if _session_factory is None:
        _engine = _get_engine()
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _session_factory


async def init_db() -> None:
    """Create tables on startup."""
    engine = _get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialised")


# ─────────────────────────────────────────────
# Session CRUD
# ─────────────────────────────────────────────

async def create_session(document_name: str, document_hash: str) -> SessionORM:
    factory = get_session_factory()
    async with factory() as db:
        session = SessionORM(document_name=document_name, document_hash=document_hash)
        db.add(session)
        await db.commit()
        await db.refresh(session)
        logger.info(f"Created session {session.id} for document '{document_name}'")
        return session


async def get_session(session_id: str) -> SessionORM | None:
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(SessionORM).where(SessionORM.id == session_id)
        )
        return result.scalar_one_or_none()


async def list_sessions() -> list[dict]:
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(
                SessionORM.id,
                SessionORM.created_at,
                SessionORM.document_name,
                func.count(MessageORM.id).label("message_count"),
            )
            .outerjoin(MessageORM, MessageORM.session_id == SessionORM.id)
            .group_by(SessionORM.id)
            .order_by(SessionORM.created_at.desc())
        )
        rows = result.all()
        return [
            {
                "id": r.id,
                "created_at": r.created_at,
                "document_name": r.document_name,
                "message_count": r.message_count,
            }
            for r in rows
        ]


async def delete_session(session_id: str) -> bool:
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(SessionORM).where(SessionORM.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            return False
        await db.delete(session)
        await db.commit()
        logger.info(f"Deleted session {session_id}")
        return True


# ─────────────────────────────────────────────
# Message CRUD
# ─────────────────────────────────────────────

async def add_message(session_id: str, role: str, content: str) -> MessageORM:
    factory = get_session_factory()
    async with factory() as db:
        msg = MessageORM(session_id=session_id, role=role, content=content)
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        return msg


async def get_messages(session_id: str) -> list[MessageORM]:
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(MessageORM)
            .where(MessageORM.session_id == session_id)
            .order_by(MessageORM.created_at.asc())
        )
        return result.scalars().all()


async def get_history_dicts(session_id: str) -> list[dict]:
    """Return messages as plain dicts for Ollama message format."""
    messages = await get_messages(session_id)
    return [{"role": m.role, "content": m.content} for m in messages]
