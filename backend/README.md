# GeoLLM Backend

FastAPI backend for geotechnical report intelligence — PDF ingestion, RAG chat, structured SPT extraction, session persistence.

## Architecture

```
backend/
├── main.py                          # FastAPI app entry point
├── src/
│   ├── api/routes/
│   │   ├── documents.py             # POST /documents/upload
│   │   ├── chat.py                  # POST /chat/stream  GET /chat/{id}/history
│   │   ├── sessions.py              # GET/DELETE /sessions
│   │   ├── extract.py               # POST /extract/spt/{session_id}
│   │   └── health.py                # GET /health
│   ├── client/
│   │   ├── document_processor.py    # PDF/DOCX/TXT extraction + chunking
│   │   ├── vector_store.py          # ChromaDB embed + retrieve
│   │   ├── ollama_client.py         # Streaming + single-shot Ollama calls
│   │   ├── session_store.py         # SQLite session + message CRUD
│   │   └── spt_extractor.py         # Structured SPT JSON extraction
│   ├── models/
│   │   └── schemas.py               # Pydantic + SQLAlchemy ORM models
│   └── utils/
│       ├── config.py                # config.yaml loader
│       ├── logger.py                # Loguru setup
│       └── hashing.py              # SHA-256 document dedup
├── config/config.yaml               # All runtime configuration
├── tests/                           # Pytest unit + integration tests
└── Dockerfile
```

## Setup

### 1. Prerequisites

```bash
# Ollama running with Mistral
OLLAMA_ORIGINS="*" ollama serve
ollama pull mistral
```

### 2. Install dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Run

```bash
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

### 4. Run tests

```bash
pip install pytest pytest-asyncio httpx
pytest tests/ -v
```

## API Reference

### Upload document
```
POST /documents/upload
Content-Type: multipart/form-data
Body: file=<PDF|DOCX|TXT>

Response:
{
  "session_id": "uuid",
  "document_name": "report.pdf",
  "num_chunks": 142,
  "num_pages": 18,
  "message": "Document processed successfully..."
}
```

### Stream chat (RAG)
```
POST /chat/stream
Content-Type: application/json
Body: { "session_id": "uuid", "query": "What are the SPT N-values at BH-1?" }

Response: text/event-stream
data: Based
data:  on
data:  the
...
data: [DONE]
```

### Extract SPT table
```
POST /extract/spt/{session_id}

Response:
{
  "session_id": "uuid",
  "document_name": "report.pdf",
  "spt_table": [
    { "borehole_id": "BH-1", "depth_m": 3.0, "n_value": 15, "soil_description": "Medium dense sand", "remarks": "" }
  ],
  "water_table_depth_m": 2.5,
  "foundation_recommendation": "Isolated footing at 1.5m feasible...",
  "safety_flags": []
}
```

### Session management
```
GET    /sessions                     # list all sessions
GET    /sessions/{session_id}        # get session + message history
DELETE /sessions/{session_id}        # delete session + vector collection
GET    /chat/{session_id}/history    # message history only
```

## Frontend integration

Update `frontend/src/App.jsx` — replace direct Ollama calls with backend API:

```js
const BACKEND_URL = "http://localhost:8000";

// 1. Upload
const form = new FormData();
form.append("file", file);
const { session_id } = await fetch(`${BACKEND_URL}/documents/upload`, {
  method: "POST", body: form
}).then(r => r.json());

// 2. Stream chat
const resp = await fetch(`${BACKEND_URL}/chat/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ session_id, query })
});
const reader = resp.body.getReader();
// read SSE tokens...

// 3. Extract SPT table
const spt = await fetch(`${BACKEND_URL}/extract/spt/${session_id}`, {
  method: "POST"
}).then(r => r.json());
```

## Swapping to fine-tuned model

In `config/config.yaml`:
```yaml
ollama:
  model: "geollm-mistral"   # your fine-tuned model name
```
