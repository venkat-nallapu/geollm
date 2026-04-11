"""
api/routes/chat.py
POST /chat/stream  — RAG-augmented streaming chat with qwen3.5 9b via Ollama.
GET  /chat/{session_id}/history — return full message history.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from loguru import logger

from src.client.ollama_client import stream_chat
from src.client.session_store import add_message, get_history_dicts, get_session
from src.client.vector_store import retrieve
from src.models.schemas import ChatRequest, MessageSchema

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    """
    RAG-augmented streaming chat.

    Flow:
    1. Validate session exists
    2. Retrieve top-k relevant chunks from ChromaDB (RAG)
    3. Build message history from SQLite
    4. Stream Ollama response token by token (SSE)
    5. Persist user message + full assistant response to SQLite
    """
    session = await get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{req.session_id}' not found.")

    # Persist user message
    await add_message(req.session_id, "user", req.query)

    # RAG retrieval
    context_chunks = retrieve(req.session_id, req.query, top_k=6)
    logger.info(f"Session {req.session_id}: retrieved {len(context_chunks)} chunks for query")

    # Chat history
    history = await get_history_dicts(req.session_id)
    # Remove the last message (we just added it) to avoid duplication
    if history and history[-1]["role"] == "user":
        history = history[:-1]

    collected_tokens = []

    async def token_generator():
        try:
            async for token in stream_chat(req.query, context_chunks, history):
                collected_tokens.append(token)
                # SSE format: data: <token>\n\n
                yield f"data: {token}\n\n"
        except Exception as e:
            logger.error(f"Ollama stream error: {e}")
            yield f"data: [ERROR: {str(e)}]\n\n"
        finally:
            # Persist full assistant response after stream completes
            full_response = "".join(collected_tokens)
            if full_response:
                await add_message(req.session_id, "assistant", full_response)
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        token_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )


@router.get("/{session_id}/history", response_model=list[MessageSchema])
async def get_chat_history(session_id: str):
    """Return full message history for a session."""
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    from src.client.session_store import get_messages
    messages = await get_messages(session_id)
    return messages
