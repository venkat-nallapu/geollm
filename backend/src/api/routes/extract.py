"""
api/routes/extract.py
POST /extract/spt/{session_id}  — structured SPT table extraction from indexed document.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from src.client.session_store import get_session
from src.client.spt_extractor import extract_spt
from src.models.schemas import SPTExtractionResult

router = APIRouter(prefix="/extract", tags=["extract"])


@router.post("/spt/{session_id}", response_model=SPTExtractionResult)
async def extract_spt_endpoint(session_id: str):
    """
    Run structured SPT data extraction on an uploaded document.

    Returns:
    - Full SPT N-value table (borehole, depth, N-value, soil description)
    - Water table depth
    - Foundation recommendation
    - Safety flags (low N-values, liquefaction risk)
    """
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    if not session.document_name:
        raise HTTPException(status_code=400, detail="No document associated with this session.")

    result = await extract_spt(session_id, session.document_name)
    return result
