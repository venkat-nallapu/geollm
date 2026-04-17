"""
main.py
GeoLLM FastAPI application entry point.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from src.api.routes import chat, documents, extract, health, sessions
from src.client.session_store import init_db
from src.utils.config import cfg
from src.utils.logger import setup_logger

from dotenv import load_dotenv
load_dotenv()  # loads backend/.env automatically


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────
    debug = cfg("app", "debug", default=False)
    setup_logger(debug=debug)

    # Ensure data directories exist
    Path("data/vectorstore").mkdir(parents=True, exist_ok=True)
    Path("logs").mkdir(exist_ok=True)

    # Init SQLite tables
    await init_db()
    logger.info("GeoLLM backend started")
    yield
    # ── Shutdown ─────────────────────────────
    logger.info("GeoLLM backend shutting down")


app = FastAPI(
    title=cfg("app", "title", default="GeoLLM Backend"),
    version=cfg("app", "version", default="0.1.0"),
    description="Geotechnical report intelligence API — PDF ingestion, RAG chat, SPT extraction",
    lifespan=lifespan,
)

# CORS — allow React frontend on localhost:5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # CRA fallback
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(sessions.router)
app.include_router(extract.router)


@app.get("/")
async def root():
    return {
        "service": "GeoLLM Backend",
        "version": cfg("app", "version", default="0.1.0"),
        "docs": "/docs",
        "health": "/health",
    }
