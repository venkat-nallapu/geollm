"""
api/routes/documents.py
POST /documents/upload  — PDF/DOCX ingestion, chunking, vector indexing.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile
from loguru import logger

from src.client.document_processor import extract_document
from src.client.session_store import create_session
from src.client.vector_store import index_document
from src.models.schemas import UploadResponse
from src.utils.config import cfg
from src.utils.hashing import hash_bytes

router = APIRouter(prefix="/documents", tags=["documents"])

_MAX_MB = cfg("document", "max_file_size_mb", default=50)
_ALLOWED_EXT = set(cfg("document", "allowed_extensions", default=[".pdf", ".docx", ".doc", ".txt"]))


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile):
    """
    Upload a geotechnical report (PDF/DOCX/TXT).
    - Extracts and chunks text
    - Embeds chunks into ChromaDB (session-scoped collection)
    - Creates a new SQLite session
    - Returns session_id for subsequent chat/extraction calls
    """
    filename = file.filename or "unnamed"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in _ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {sorted(_ALLOWED_EXT)}",
        )

    file_bytes = await file.read()
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > _MAX_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Limit is {_MAX_MB} MB.",
        )

    logger.info(f"Processing upload: {filename} ({size_mb:.2f} MB)")

    try:
        doc = extract_document(file_bytes, filename)
    except Exception as e:
        logger.error(f"Extraction failed for {filename}: {e}")
        raise HTTPException(status_code=422, detail=f"Document extraction failed: {str(e)}")

    doc_hash = hash_bytes(file_bytes)
    session = await create_session(document_name=filename, document_hash=doc_hash)

    try:
        num_chunks = index_document(session.id, doc.chunks)
    except Exception as e:
        logger.error(f"Indexing failed for session {session.id}: {e}")
        raise HTTPException(status_code=500, detail=f"Vector indexing failed: {str(e)}")

    return UploadResponse(
        session_id=session.id,
        document_name=filename,
        num_chunks=num_chunks,
        num_pages=doc.num_pages,
        message=f"Document processed successfully. {num_chunks} chunks indexed across {doc.num_pages} pages.",
    )
