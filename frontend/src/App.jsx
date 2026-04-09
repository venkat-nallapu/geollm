import { useState, useRef, useEffect, useCallback } from "react";

const BACKEND_URL = "http://localhost:8000";

const SYSTEM_PROMPT = `You are GeoLLM, a specialized AI assistant for geotechnical engineering. You analyze soil investigation reports, boring logs, and geotechnical documents.

Your expertise includes:
- SPT (Standard Penetration Test) N-value interpretation per IS 2131
- Soil classification per IS 1498 (visual-manual and sieve analysis)
- Foundation recommendations per IS 6403 (shallow) and IS 2911 (pile)
- Bearing capacity analysis, liquefaction assessment, settlement calculations
- Interpretation of boring logs, laboratory test results, and site investigation reports

When analyzing documents:
1. Extract key parameters: SPT N-values, soil strata, depth profiles, water table
2. Flag safety concerns (very low N-values, liquefiable zones, expansive soils)
3. Provide foundation type recommendations with reasoning
4. Always cite the depth and borehole number when referencing data

Respond concisely with engineering precision. Use tables for SPT summaries when appropriate.`;

const GEOTECHNICAL_STARTERS = [
  "Summarize the SPT N-values across all boreholes",
  "What foundation type do you recommend for this site?",
  "Identify any liquefiable zones in the boring logs",
  "What is the bearing capacity at 3m depth?",
  "Classify the soil strata per IS 1498",
  "Is the water table a concern for shallow foundations?",
];

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M9 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V6L9 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M9 1v5h5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M14 8L2 2l3 6-3 6 12-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function StatusDot({ connected }) {
  return (
    <span style={{
      display: "inline-block",
      width: 7, height: 7,
      borderRadius: "50%",
      background: connected ? "#1D9E75" : "#E24B4A",
      marginRight: 6,
      flexShrink: 0,
    }} />
  );
}

function extractTextFromPDF(arrayBuffer) {
  return new Promise((resolve) => {
    if (typeof pdfjsLib === "undefined") {
      resolve("[PDF.js not loaded — text extraction unavailable. Describe the document manually.]");
      return;
    }
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    loadingTask.promise.then(async (pdf) => {
      let fullText = "";
      const maxPages = Math.min(pdf.numPages, 30);
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(" ");
        fullText += `\n--- Page ${i} ---\n${pageText}`;
      }
      resolve(fullText.slice(0, 18000));
    }).catch(() => resolve("[Could not extract PDF text]"));
  });
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-end" : "flex-start",
      marginBottom: 20,
    }}>
      <div style={{
        fontSize: 11,
        color: "var(--color-text-tertiary)",
        marginBottom: 4,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        fontWeight: 500,
      }}>
        {isUser ? "You" : "GeoLLM"}
      </div>
      <div style={{
        maxWidth: "82%",
        background: isUser
          ? "var(--color-background-secondary)"
          : "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: isUser
          ? "12px 12px 4px 12px"
          : "12px 12px 12px 4px",
        padding: "10px 14px",
        fontSize: 14,
        lineHeight: 1.65,
        color: "var(--color-text-primary)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {msg.content}
        {msg.streaming && (
          <span style={{
            display: "inline-block",
            width: 6, height: 14,
            background: "var(--color-text-secondary)",
            marginLeft: 2,
            verticalAlign: "text-bottom",
            animation: "blink 0.9s step-end infinite",
          }} />
        )}
      </div>
      {msg.docName && (
        <div style={{
          marginTop: 6,
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          color: "var(--color-text-secondary)",
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 6,
          padding: "3px 8px",
          maxWidth: 220,
        }}>
          <FileIcon />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {msg.docName}
          </span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [uploadedDoc, setUploadedDoc] = useState(null);
  const [docText, setDocText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    checkOllama();
    const interval = setInterval(checkOllama, 15000);
    return () => clearInterval(interval);
  }, []);

  async function checkOllama() {
    try {
      const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
      setOllamaStatus(r.ok);
    } catch {
      setOllamaStatus(false);
    }
  }

async function processFile(file) {
  setIsProcessingFile(true);
  try {
    const form = new FormData();
    form.append("file", file);

    const resp = await fetch(`${BACKEND_URL}/documents/upload`, {
      method: "POST",
      body: form,
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || "Upload failed");
    }

    const data = await resp.json();
    // data = { session_id, document_name, num_chunks, num_pages, message }

    setUploadedDoc(data.document_name);
    setSessionId(data.session_id);   // ← store this in state (add useState for it)

    setMessages((prev) => [...prev, {
      role: "assistant",
      content: `Document loaded: **${data.document_name}**\n\n${data.message}`,
      id: Date.now(),
    }]);
  } catch (e) {
    // show error in chat
  } finally {
    setIsProcessingFile(false);
  }
}

  function handleFileDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }

  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

async function sendMessage(text) {
  const userText = (text || input).trim();
  if (!userText || isStreaming) return;
  setInput("");

  const userMsg = { role: "user", content: userText, id: Date.now() };
  setMessages((prev) => [...prev, userMsg]);

  const assistantId = Date.now() + 1;
  setMessages((prev) => [...prev,
    { role: "assistant", content: "", id: assistantId, streaming: true }
  ]);
  setIsStreaming(true);

  try {
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const resp = await fetch(`${BACKEND_URL}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,   // ← use stored session_id
        query: userText,
      }),
      signal: ctrl.signal,
    });

    if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const token = line.slice(6);          // strip "data: "
        if (token === "[DONE]") break;
        accumulated += token;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: accumulated, streaming: true }
              : m
          )
        );
      }
    }

    // Mark streaming done
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId ? { ...m, streaming: false } : m
      )
    );

  } catch (e) {
    if (e.name !== "AbortError") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Backend error: ${e.message}\n\nIs the backend running? → uvicorn main:app --port 8000`, streaming: false }
            : m
        )
      );
    }
  } finally {
    setIsStreaming(false);
  }
}

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function clearDoc() {
    setUploadedDoc(null);
    setDocText("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        maxWidth: 780,
        margin: "0 auto",
        fontFamily: "var(--font-sans)",
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleFileDrop}
    >
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .msg-appear { animation: fadeIn 0.2s ease-out; }
        textarea { resize: none; }
        textarea:focus { outline: none; }
        .starter-btn:hover { background: var(--color-background-secondary) !important; border-color: var(--color-border-secondary) !important; }
        .action-btn:hover { background: var(--color-background-secondary) !important; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "14px 20px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15,
          }}>
            ⛏
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
              GeoLLM
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 1 }}>
              Geotechnical report interpreter
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {uploadedDoc && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 6,
              padding: "4px 8px 4px 10px",
              fontSize: 12,
              color: "var(--color-text-secondary)",
              maxWidth: 200,
            }}>
              <FileIcon />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {uploadedDoc}
              </span>
              <button
                onClick={clearDoc}
                className="action-btn"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--color-text-tertiary)", padding: "0 2px",
                  display: "flex", alignItems: "center",
                }}
              >
                <ClearIcon />
              </button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: "var(--color-text-secondary)" }}>
            <StatusDot connected={ollamaStatus === true} />
            <span>
              {ollamaStatus === null ? "Checking..." : ollamaStatus ? `mistral` : "Ollama offline"}
            </span>
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      {isDragging && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 50,
          background: "var(--color-background-primary)",
          opacity: 0.95,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          border: "2px dashed var(--color-border-secondary)",
          borderRadius: 12, margin: 8,
          pointerEvents: "none",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)" }}>
            Drop soil investigation report
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 6 }}>
            PDF, TXT supported
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 20px 8px",
      }}>
        {isEmpty ? (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            height: "100%", gap: 24,
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: 40, marginBottom: 12,
                filter: "grayscale(0.3)",
              }}>⛏</div>
              <div style={{
                fontSize: 20, fontWeight: 500,
                color: "var(--color-text-primary)",
                letterSpacing: "-0.02em",
                marginBottom: 6,
              }}>
                GeoLLM
              </div>
              <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: 380 }}>
                Upload a soil investigation report or boring log, then ask questions about SPT values, soil classification, and foundation recommendations.
              </div>
            </div>

            {/* Upload zone */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFile}
              style={{
                background: "var(--color-background-secondary)",
                border: "1px dashed var(--color-border-secondary)",
                borderRadius: 10,
                padding: "20px 40px",
                cursor: isProcessingFile ? "wait" : "pointer",
                display: "flex", flexDirection: "column",
                alignItems: "center", gap: 8,
                width: "100%", maxWidth: 360,
                color: "var(--color-text-secondary)",
                transition: "border-color 0.15s",
              }}
            >
              <span style={{ fontSize: 24 }}>📂</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
                {isProcessingFile ? "Processing..." : "Upload report"}
              </span>
              <span style={{ fontSize: 12 }}>
                PDF, TXT · or drag & drop
              </span>
            </button>

            {/* Starter questions */}
            <div style={{ width: "100%", maxWidth: 560 }}>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, textAlign: "center" }}>
                Try asking
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {GEOTECHNICAL_STARTERS.map((s, i) => (
                  <button
                    key={i}
                    className="starter-btn"
                    onClick={() => sendMessage(s)}
                    style={{
                      background: "var(--color-background-primary)",
                      border: "0.5px solid var(--color-border-tertiary)",
                      borderRadius: 8,
                      padding: "9px 12px",
                      fontSize: 12.5,
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                      textAlign: "left",
                      lineHeight: 1.4,
                      transition: "all 0.15s",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div>
            {messages.map((msg) => (
              <div key={msg.id} className="msg-appear">
                <Message msg={msg} />
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{
        padding: "12px 20px 20px",
        borderTop: "0.5px solid var(--color-border-tertiary)",
        flexShrink: 0,
      }}>
        {/* File upload strip (if no doc loaded) */}
        {!uploadedDoc && !isEmpty && (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--color-text-tertiary)",
              padding: "0 0 10px",
            }}
          >
            <FileIcon />
            Upload report
          </button>
        )}

        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: 12,
          padding: "8px 8px 8px 14px",
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about SPT values, soil classification, foundation type…"
            rows={1}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              fontSize: 14,
              color: "var(--color-text-primary)",
              lineHeight: 1.6,
              fontFamily: "var(--font-sans)",
              minHeight: 24,
              maxHeight: 160,
              overflow: "auto",
            }}
          />
          <button
            onClick={isStreaming ? stopStreaming : () => sendMessage()}
            disabled={!isStreaming && !input.trim()}
            style={{
              width: 34, height: 34,
              borderRadius: 8,
              border: "none",
              background: isStreaming
                ? "var(--color-background-danger)"
                : input.trim()
                  ? "#1D9E75"
                  : "var(--color-background-secondary)",
              color: isStreaming
                ? "var(--color-text-danger)"
                : input.trim()
                  ? "#fff"
                  : "var(--color-text-tertiary)",
              cursor: (!isStreaming && !input.trim()) ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {isStreaming ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="2" y="2" width="10" height="10" rx="2"/>
              </svg>
            ) : (
              <SendIcon />
            )}
          </button>
        </div>

        <div style={{
          fontSize: 11, color: "var(--color-text-tertiary)",
          marginTop: 8, textAlign: "center", lineHeight: 1.5,
        }}>
          {ollamaStatus === false
            ? "⚠ Ollama not running — start with: ollama serve && ollama pull mistral"
            : "Shift+Enter for new line · runs on Mistral 7B via Ollama"}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.docx,.doc"
        onChange={handleFileInput}
        style={{ display: "none" }}
      />
    </div>
  );
}
