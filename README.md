# GeoLLM

**A domain-adapted LLM for Indian geotechnical engineering** — built on top of Mistral 7B with QLoRA fine-tuning and a hybrid RAG pipeline, designed to interpret site investigation reports, extract SPT N-values, and assist geotechnical engineers with borehole data analysis.

> Built by [axialnet](https://axialnet.in) · Live at [geollm.axialnet.in](https://geollm.axialnet.in)

---

## Overview

Indian geotechnical site investigation reports are dense, inconsistently formatted documents containing critical subsurface data — SPT N-values, soil classifications, borehole logs — that typically require manual interpretation. GeoLLM automates this by combining a fine-tuned LLM with a retrieval-augmented generation (RAG) pipeline optimised for the Indian geological context.

Key capabilities:
- Upload geotechnical PDF/DOCX reports and query them in natural language
- Automatic extraction and structured validation of SPT N-values (targeting recall ≥ 0.90)
- Safety flagging for anomalous or out-of-range values
- Hybrid BM25 + dense retrieval with FAISS for fast, accurate document search
- Streaming chat interface with persistent session history

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      React + Vite                       │
│          (PDF upload · streaming chat · drag-drop)      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / SSE
┌──────────────────────▼──────────────────────────────────┐
│                    FastAPI Backend                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ PDF/DOCX    │  │  RAG Engine  │  │  Chat History  │  │
│  │ Extraction  │  │  (Hybrid)    │  │  (SQLite)      │  │
│  │ pdfplumber  │  │  BM25+FAISS  │  │                │  │
│  │ python-docx │  │  BGE-M3      │  │                │  │
│  └─────────────┘  └──────┬───────┘  └────────────────┘  │
│                          │ Retrieve                     │
│  ┌───────────────────────▼───────────────────────────┐  │
│  │         Fine-tuned Mistral 7B (QLoRA / GGUF)      │  │
│  │         served via Ollama                         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Model

- **Base model:** Mistral 7B (alternatives: Llama 3.1 8B, Qwen2.5 7B)
- **Fine-tuning:** QLoRA with 4-bit NF4 quantization
- **Training data:** ChatML-formatted JSONL from Indian geotechnical site investigation reports
- **Deployment:** GGUF quantisation via Ollama

### RAG Pipeline

- **Embeddings:** `BAAI/bge-m3` (multilingual dense retrieval)
- **Vector store:** FAISS
- **Hybrid retrieval:** BM25 + dense search fused via Reciprocal Rank Fusion (RRF)
- **Query routing:** intent-based router to direct queries to the appropriate retrieval path

### Data Pipeline

Handles two primary report formats found in Indian geotechnical practice:
- **Format A** — corrected N-value summary tables
- **Format B** — BORE/DRILL LOG multi-line cell layouts

Raw PDFs → custom extractors → structured SPT N-value records → Pydantic validation → ChatML JSONL for fine-tuning.

---

## Getting Started

### Prerequisites

- Python 3.12
- Node.js 18+
- [Ollama](https://ollama.com/) installed and running

### Backend

```bash
# Create and activate virtual environment
python3 -m venv geollm-env
source geollm-env/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Start the FastAPI server
cd backend
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

OR Just run: `https://geollm.axialnet.in` on your browser

### Model Setup (Ollama)

```bash
# Pull or run your GGUF model via Ollama
ollama run mistral
```

Configure the model endpoint in `backend/config/config.yaml`.

---

## Configuration

`backend/config/config.yaml` controls:
- Ollama model endpoint and model name
- FAISS index path
- SQLite database path
- Retrieval parameters (top-k, BM25 weight, RRF constant)
- SPT N-value safety thresholds

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | Mistral 7B (QLoRA fine-tuned) |
| Serving | Ollama (GGUF) |
| Embeddings | BAAI/bge-m3 |
| Vector DB | FAISS |
| Backend | FastAPI + Uvicorn |
| PDF Extraction | pdfplumber, pypdfium2 |
| DOCX Extraction | python-docx |
| Validation | Pydantic |
| Chat Storage | SQLite |
| Frontend | React + Vite |
| Containerisation | Docker |

---

## Fine-tuning

Training is designed to run on HPC environments (Param Shivay, AiKosh A100):

```bash
# Example QLoRA fine-tuning (see training scripts in src/)
python src/train.py \
  --model_name mistralai/Mistral-7B-v0.1 \
  --data_path data/train.jsonl \
  --output_dir outputs/geollm-ft \
  --bits 4 \
  --lora_r 64 \
  --lora_alpha 16
```

Training target: SPT N-value recall ≥ 0.90.

---

## Roadmap

- [ ] Expanded training corpus across all major Indian geology types (alluvial, laterite, black cotton soil, rock formations)
- [ ] Multi-document cross-referencing
- [ ] Structured report generation (PDF export)
- [ ] REST API for third-party geotechnical software integration
- [ ] arXiv / journal publication

---

## Contributing

This project is in active development. If you work in ML engineering or System arch and want to contribute training data or model improvements, reach out at [gmail](mailto:nallapuvenkat6@gmail.com), [linkedln](www.linkedln.com/in/venkat-nallapu).

---

## License

MIT

---

## About

GeoLLM is a project by [axialnet](https://axialnet.in), building ML systems for physical-world engineering domains.

01
