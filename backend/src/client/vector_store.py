"""
client/vector_store.py
ChromaDB-based vector store with sentence-transformers embeddings.
Each session gets its own Chroma collection — isolated per document.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from loguru import logger

from src.client.document_processor import DocumentChunk
from src.utils.config import cfg


@lru_cache(maxsize=1)
def _get_embedding_model():
    """Lazy-load sentence-transformers model (cached after first call)."""
    from sentence_transformers import SentenceTransformer
    model_name = cfg("embedding", "model", default="all-MiniLM-L6-v2")
    logger.info(f"Loading embedding model: {model_name}")
    return SentenceTransformer(model_name)


@lru_cache(maxsize=1)
def _get_chroma_client():
    import chromadb
    persist_dir = cfg("vectorstore", "persist_dir", default="./data/vectorstore")
    Path(persist_dir).mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=persist_dir)


def _collection_name(session_id: str) -> str:
    prefix = cfg("vectorstore", "collection_prefix", default="geollm_session_")
    # Chroma collection names must be 3-63 chars, alphanumeric + hyphens
    safe_id = session_id.replace("-", "")[:40]
    return f"{prefix}{safe_id}"


class GeoEmbeddingFunction:
    """Chroma-compatible embedding function wrapping sentence-transformers."""

    def __call__(self, input: list[str]) -> list[list[float]]:
        model = _get_embedding_model()
        embeddings = model.encode(input, normalize_embeddings=True)
        return embeddings.tolist()


def index_document(session_id: str, chunks: list[DocumentChunk]) -> int:
    """
    Embed and store all document chunks in a session-scoped Chroma collection.
    Returns number of chunks indexed.
    """
    if not chunks:
        logger.warning("No chunks to index.")
        return 0

    client = _get_chroma_client()
    col_name = _collection_name(session_id)

    # Delete existing collection for this session if re-uploading
    try:
        client.delete_collection(col_name)
    except Exception:
        pass

    collection = client.create_collection(
        name=col_name,
        embedding_function=GeoEmbeddingFunction(),
        metadata={"hnsw:space": "cosine"},
    )

    ids = [f"{session_id}_{i}" for i in range(len(chunks))]
    documents = [c.text for c in chunks]
    metadatas = [
        {"page_num": c.page_num, "chunk_index": c.chunk_index, "source": c.source}
        for c in chunks
    ]

    # Batch insert (Chroma handles large batches internally)
    collection.add(ids=ids, documents=documents, metadatas=metadatas)
    logger.info(f"Indexed {len(chunks)} chunks into collection '{col_name}'")
    return len(chunks)


def retrieve(session_id: str, query: str, top_k: int = 6) -> list[str]:
    """
    Retrieve top-k most relevant chunks for a query from the session's collection.
    Returns list of text strings, ranked by relevance.
    """
    client = _get_chroma_client()
    col_name = _collection_name(session_id)

    try:
        collection = client.get_collection(
            name=col_name,
            embedding_function=GeoEmbeddingFunction(),
        )
    except Exception:
        logger.warning(f"No vector collection found for session {session_id}. Returning empty context.")
        return []

    results = collection.query(
        query_texts=[query],
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    # Format chunks with source metadata
    formatted = []
    for doc, meta, dist in zip(docs, metas, distances):
        relevance = round(1 - dist, 3)
        page = meta.get("page_num", "?")
        formatted.append(f"[Page {page} | relevance={relevance}]\n{doc}")

    logger.debug(f"Retrieved {len(formatted)} chunks for query: '{query[:60]}...'")
    return formatted


def delete_session_collection(session_id: str) -> None:
    """Remove the vector collection when a session is deleted."""
    client = _get_chroma_client()
    col_name = _collection_name(session_id)
    try:
        client.delete_collection(col_name)
        logger.info(f"Deleted collection: {col_name}")
    except Exception as e:
        logger.warning(f"Could not delete collection {col_name}: {e}")
