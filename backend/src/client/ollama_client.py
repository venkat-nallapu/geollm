"""
client/ollama_client.py
Async Ollama client — supports streaming chat and single-shot completion.
"""

from __future__ import annotations

import json
from typing import AsyncIterator

import httpx
from loguru import logger

from src.utils.config import cfg

SYSTEM_PROMPT = """You are GeoLLM, a domain-specialized AI assistant for geotechnical engineering analysis.

Your expertise covers:
- SPT (Standard Penetration Test) N-value interpretation per IS 2131
- Soil classification per IS 1498
- Shallow foundation bearing capacity per IS 6403
- Pile foundation design per IS 2911
- Liquefaction assessment, settlement estimation, water table impact
- Interpretation of boring logs, site investigation reports, lab test results

When answering from retrieved document context:
1. Always cite the page number if available: (Page X)
2. Extract and present SPT N-values in tabular form when relevant
3. Flag safety concerns clearly: N-values < 5 in saturated sand = liquefaction risk
4. Provide IS code references for recommendations
5. Be concise and engineering-precise — avoid generic explanations

If the context does not contain enough information, say so explicitly rather than guessing."""

SPT_EXTRACTION_PROMPT = """You are a geotechnical data extractor. Given the following text from a soil investigation report, extract ALL SPT test data and return a valid JSON object.

The JSON must follow this exact schema:
{
  "spt_table": [
    {
      "borehole_id": "BH-1",
      "depth_m": 3.0,
      "n_value": 12,
      "soil_description": "Medium dense sand",
      "remarks": ""
    }
  ],
  "water_table_depth_m": 2.5,
  "foundation_recommendation": "Isolated footing at 1.5m depth feasible. Safe bearing capacity ~120 kN/m².",
  "safety_flags": ["Low N-values (<5) at BH-2 depth 1.5m — liquefaction risk in seismic zone"]
}

Rules:
- If a field is unknown, use null
- n_value must be integer
- depth_m must be float
- Return ONLY valid JSON, no markdown, no explanation
- If no SPT data found, return {"spt_table": [], "water_table_depth_m": null, "foundation_recommendation": null, "safety_flags": ["No SPT data found in document"]}

Document text:
"""


def _get_ollama_url() -> str:
    return cfg("ollama", "base_url", default="http://localhost:11434")


def _get_model() -> str:
    return cfg("ollama", "model", default="mistral")


def _get_timeout() -> int:
    return cfg("ollama", "timeout", default=120)


def _build_messages(
    query: str,
    context_chunks: list[str],
    history: list[dict],
) -> list[dict]:
    """Assemble messages array with RAG context injected before user query."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Inject retrieved context as a system-level context block
    if context_chunks:
        context_text = "\n\n".join(context_chunks)
        messages.append({
            "role": "system",
            "content": f"RETRIEVED DOCUMENT CONTEXT (use this to answer the user's question):\n\n{context_text}",
        })

    # Add conversation history (last 10 turns)
    messages.extend(history[-10:])

    # Add current query
    messages.append({"role": "user", "content": query})
    return messages


async def stream_chat(
    query: str,
    context_chunks: list[str],
    history: list[dict],
) -> AsyncIterator[str]:
    """
    Yield text tokens from Ollama streaming chat endpoint.
    Each yielded value is a raw text delta.
    """
    messages = _build_messages(query, context_chunks, history)
    payload = {
        "model": _get_model(),
        "messages": messages,
        "stream": True,
    }

    url = f"{_get_ollama_url()}/api/chat"
    logger.debug(f"Streaming from Ollama: model={_get_model()}, chunks={len(context_chunks)}")

    async with httpx.AsyncClient(timeout=_get_timeout()) as client:
        async with client.stream("POST", url, json=payload) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                raise RuntimeError(f"Ollama returned {resp.status_code}: {error_body.decode()}")

            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    token = data.get("message", {}).get("content", "")
                    if token:
                        yield token
                    if data.get("done"):
                        break
                except json.JSONDecodeError:
                    continue


async def complete(prompt: str) -> str:
    """
    Single-shot non-streaming completion via Ollama.
    Used for structured SPT extraction.
    """
    payload = {
        "model": _get_model(),
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }

    url = f"{_get_ollama_url()}/api/chat"
    logger.debug(f"Single-shot completion: model={_get_model()}")

    async with httpx.AsyncClient(timeout=_get_timeout()) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "")


async def health_check() -> dict:
    """Check Ollama availability and list available models."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{_get_ollama_url()}/api/tags")
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            configured_model = _get_model()
            return {
                "status": "ok",
                "ollama_url": _get_ollama_url(),
                "configured_model": configured_model,
                "model_available": any(configured_model in m for m in models),
                "available_models": models,
            }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "ollama_url": _get_ollama_url(),
        }
