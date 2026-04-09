"""
client/spt_extractor.py
Structured SPT table extraction from geotechnical report text.
Uses Ollama to parse raw text into a validated Pydantic schema.
"""

from __future__ import annotations

import json
import re

from loguru import logger

from src.client.ollama_client import SPT_EXTRACTION_PROMPT, complete
from src.client.vector_store import retrieve
from src.models.schemas import SPTExtractionResult, SPTRow
from src.utils.config import cfg


def _parse_spt_json(raw: str) -> dict:
    """
    Extract JSON from LLM response.
    LLMs sometimes wrap JSON in markdown code fences — strip them.
    """
    # Remove ```json ... ``` or ``` ... ```
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()

    # Find first { ... } block
    match = re.search(r'\{.*\}', cleaned, re.DOTALL)
    if match:
        return json.loads(match.group())
    raise ValueError(f"No valid JSON found in LLM response: {raw[:200]}")


async def extract_spt(session_id: str, document_name: str) -> SPTExtractionResult:
    """
    Retrieve SPT-relevant chunks from the vector store and run structured
    extraction via Ollama. Returns a validated SPTExtractionResult.
    """
    # Targeted retrieval queries to capture all SPT data
    spt_queries = [
        "SPT N-value borehole depth blow count",
        "standard penetration test results table",
        "water table groundwater level",
        "soil strata boring log",
        "foundation recommendation bearing capacity",
    ]

    seen_chunks = set()
    all_chunks = []
    for q in spt_queries:
        chunks = retrieve(session_id, q, top_k=4)
        for c in chunks:
            if c not in seen_chunks:
                seen_chunks.add(c)
                all_chunks.append(c)

    if not all_chunks:
        logger.warning(f"No chunks found for session {session_id} during SPT extraction")
        return SPTExtractionResult(
            session_id=session_id,
            document_name=document_name,
            spt_table=[],
            water_table_depth_m=None,
            foundation_recommendation=None,
            safety_flags=["No document indexed for this session"],
            raw_llm_response="",
        )

    context_text = "\n\n".join(all_chunks[:12])  # cap at 12 chunks
    prompt = SPT_EXTRACTION_PROMPT + context_text

    logger.info(f"Running SPT extraction on {len(all_chunks)} chunks for session {session_id}")
    raw_response = await complete(prompt)

    try:
        parsed = _parse_spt_json(raw_response)
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"SPT JSON parse failed: {e}")
        return SPTExtractionResult(
            session_id=session_id,
            document_name=document_name,
            spt_table=[],
            water_table_depth_m=None,
            foundation_recommendation=None,
            safety_flags=[f"Extraction failed — could not parse LLM response: {str(e)}"],
            raw_llm_response=raw_response,
        )

    # Validate and build SPT rows
    spt_rows = []
    for row in parsed.get("spt_table", []):
        try:
            spt_rows.append(SPTRow(**row))
        except Exception as e:
            logger.warning(f"Skipping invalid SPT row {row}: {e}")

    # Auto-add safety flags for very low N-values
    safety_flags = parsed.get("safety_flags") or []
    very_loose_max = cfg("spt", "very_loose_sand_max", default=4)
    for row in spt_rows:
        if row.n_value <= very_loose_max:
            flag = (
                f"CRITICAL: N={row.n_value} at {row.borehole_id}, depth={row.depth_m}m "
                f"— very loose/soft, check liquefaction and bearing capacity"
            )
            if flag not in safety_flags:
                safety_flags.append(flag)

    return SPTExtractionResult(
        session_id=session_id,
        document_name=document_name,
        spt_table=spt_rows,
        water_table_depth_m=parsed.get("water_table_depth_m"),
        foundation_recommendation=parsed.get("foundation_recommendation"),
        safety_flags=safety_flags,
        raw_llm_response=raw_response,
    )
