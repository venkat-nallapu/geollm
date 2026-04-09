# GeoLLM Frontend

React + Vite chat interface for geotechnical report analysis using Mistral 7B via Ollama.

## Setup

### 1. Prerequisites

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull Mistral 7B
ollama pull mistral

# Start Ollama with CORS enabled (required for browser access)
OLLAMA_ORIGINS="*" ollama serve
```

### 2. Install & run frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Usage

1. **Upload a report** — drag & drop or click to upload a soil investigation PDF or .txt boring log
2. **Ask questions** — e.g.:
   - "Summarize SPT N-values across all boreholes"
   - "What foundation type do you recommend?"
   - "Identify liquefiable zones"
   - "What is the bearing capacity at 3m depth?"

## Architecture

```
frontend/
├── src/
│   ├── App.jsx          # Main component — upload + chat UI
│   ├── main.jsx         # React entry point
│   └── index.css        # Global styles + CSS variable fallbacks
├── index.html           # PDF.js CDN loaded here
├── vite.config.js       # Dev server + Ollama proxy
└── package.json
```

## Swapping to fine-tuned model

When your QLoRA fine-tuned model is ready:

```js
// In App.jsx, change:
const MODEL = "mistral";
// to:
const MODEL = "geollm-mistral";  // your Ollama model name after ollama create
```

To register your GGUF model with Ollama:
```bash
# Create a Modelfile
echo 'FROM ./geollm-mistral.gguf\nSYSTEM "You are GeoLLM..."' > Modelfile
ollama create geollm-mistral -f Modelfile
```

## CORS fix if Ollama rejects requests

```bash
# Linux/Mac
OLLAMA_ORIGINS="http://localhost:5173" ollama serve

# Windows (PowerShell)
$env:OLLAMA_ORIGINS="http://localhost:5173"; ollama serve
```
