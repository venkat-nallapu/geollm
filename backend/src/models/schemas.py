"""
models/schemas.py
Pydantic request/response schemas + SQLAlchemy ORM models for GeoLLM.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# ─────────────────────────────────────────────
# SQLAlchemy ORM (SQLite)
# ─────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class SessionORM(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    document_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    document_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    messages: Mapped[list[MessageORM]] = relationship("MessageORM", back_populates="session", cascade="all, delete-orphan")


class MessageORM(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(16))          # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    session: Mapped[SessionORM] = relationship("SessionORM", back_populates="messages")


# ─────────────────────────────────────────────
# Pydantic — API request / response schemas
# ─────────────────────────────────────────────

class UploadResponse(BaseModel):
    session_id: str
    document_name: str
    num_chunks: int
    num_pages: int
    message: str


class ChatRequest(BaseModel):
    session_id: str
    query: str = Field(..., min_length=1, max_length=4000)


class MessageSchema(BaseModel):
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class SessionSchema(BaseModel):
    id: str
    created_at: datetime
    document_name: Optional[str]
    messages: list[MessageSchema] = []

    class Config:
        from_attributes = True


class SessionSummary(BaseModel):
    id: str
    created_at: datetime
    document_name: Optional[str]
    message_count: int


# ─────────────────────────────────────────────
# Pydantic — Structured SPT extraction output
# ─────────────────────────────────────────────

class SPTRow(BaseModel):
    borehole_id: str = Field(description="Borehole identifier, e.g. BH-1")
    depth_m: float = Field(description="Depth of SPT test in metres")
    n_value: int = Field(description="SPT N-value (blow count)")
    soil_description: Optional[str] = Field(None, description="Soil type at this depth")
    remarks: Optional[str] = Field(None, description="Liquefaction risk, refusal, etc.")


class SPTExtractionResult(BaseModel):
    session_id: str
    document_name: str
    spt_table: list[SPTRow]
    water_table_depth_m: Optional[float]
    foundation_recommendation: Optional[str]
    safety_flags: list[str] = Field(default_factory=list, description="Critical findings")
    raw_llm_response: str
