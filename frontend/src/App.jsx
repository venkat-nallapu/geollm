import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const BACKEND_URL = "http://localhost:8000";
const OLLAMA_URL = "http://localhost:11434";

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

Respond concisely with engineering precision. Format your response in clean Markdown:
- Always put a blank line before and after tables
- Use ## for section headings
- Use - for bullet lists
- Tables must have a header row and separator row (| --- |)
- Never start a table immediately after a colon on the same line`;

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

function HistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 4.5V8l2.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 3h9M5 3V2h3v1M3.5 3l.5 8h5l.5-8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
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

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ isOpen, onClose, onLoadSession, currentSessionId }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  async function fetchSessions() {
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/sessions/`);
      const data = await r.json();
      setSessions(data);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) fetchSessions();
  }, [isOpen]);

  async function handleDelete(e, sessionId) {
    e.stopPropagation();
    await fetch(`${BACKEND_URL}/sessions/${sessionId}`, { method: "DELETE" });
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 40,
            background: "rgba(0,0,0,0.25)",
          }}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: "fixed",
        top: 0, left: 0, bottom: 0,
        width: 280,
        zIndex: 50,
        background: "var(--color-background-primary)",
        borderRight: "0.5px solid var(--color-border-tertiary)",
        transform: isOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.22s ease",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Sidebar header */}
        <div style={{
          padding: "16px 16px 12px",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
            Previous Chats
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--color-text-tertiary)", padding: 4,
              display: "flex", alignItems: "center",
            }}
          >
            <ClearIcon />
          </button>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {loading && (
            <div style={{ padding: "20px 16px", fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center" }}>
              Loading...
            </div>
          )}
          {!loading && sessions.length === 0 && (
            <div style={{ padding: "20px 16px", fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center" }}>
              No previous chats
            </div>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => { onLoadSession(s.id); onClose(); }}
              className="session-item"
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                borderLeft: s.id === currentSessionId
                  ? "2px solid #1D9E75"
                  : "2px solid transparent",
                background: s.id === currentSessionId
                  ? "var(--color-background-secondary)"
                  : "transparent",
                display: "flex", alignItems: "flex-start",
                justifyContent: "space-between", gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500,
                  color: "var(--color-text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {s.document_name || "Untitled"}
                </div>
                <div style={{
                  fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2,
                  display: "flex", gap: 6,
                }}>
                  <span>{formatDate(s.created_at)}</span>
                  <span>·</span>
                  <span>{s.message_count} msg{s.message_count !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, s.id)}
                className="delete-btn"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--color-text-tertiary)", padding: "2px",
                  display: "flex", alignItems: "center", flexShrink: 0,
                  opacity: 0,
                }}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Message ───────────────────────────────────────────────────────────────────

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
        wordBreak: "break-word",
      }}>
        {isUser ? (
          msg.content
        ) : (
          <div className="geollm-response">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}
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

// ── App ───────────────────────────────────────────────────────────────────────

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  async function loadSession(sid) {
    try {
      const r = await fetch(`${BACKEND_URL}/sessions/${sid}`);
      if (!r.ok) return;
      const data = await r.json();

      setSessionId(sid);
      setUploadedDoc(data.document_name);

      const msgs = (data.messages || []).map((m, i) => ({
        role: m.role,
        content: m.content,
        id: i,
      }));
      setMessages(msgs);
    } catch (e) {
      console.error("Failed to load session", e);
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
      setUploadedDoc(data.document_name);
      setSessionId(data.session_id);

      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Document loaded: **${data.document_name}**\n\n${data.message}`,
        id: Date.now(),
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Upload failed: ${e.message}`,
        id: Date.now(),
      }]);
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

    if (!sessionId) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Please upload a geotechnical report first before asking questions.",
        id: Date.now(),
      }]);
      return;
    }
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
        body: JSON.stringify({ session_id: sessionId, query: userText }),
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
       const lines = chunk.split("\n");

       for (const line of lines) {
         if (!line.startsWith("data: ")) continue;
         const raw = line.slice(6);
         if (raw === "[DONE]") break;

  // Decode JSON-encoded token if backend uses JSON, else use raw
         let token;
         try {
             token = JSON.parse(raw);
         } catch {
           token = raw === "" ? "\n" : raw; // empty data line = newline token
         }

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
    setSessionId(null);
    setMessages([]);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLoadSession={loadSession}
        currentSessionId={sessionId}
      />

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
          .session-item:hover { background: var(--color-background-secondary) !important; }
          .session-item:hover .delete-btn { opacity: 1 !important; }
          .delete-btn:hover { color: #E24B4A !important; }
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
            {/* History button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="action-btn"
              title="Previous chats"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--color-text-tertiary)", padding: 4,
                display: "flex", alignItems: "center", borderRadius: 6,
              }}
            >
              <HistoryIcon />
            </button>

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
                {ollamaStatus === null ? "Checking..." : ollamaStatus ? "llama3.2:3b" : "Ollama offline"}
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
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px" }}>
          {isEmpty ? (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              height: "100%", gap: 24,
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12, filter: "grayscale(0.3)" }}>⛏</div>
                <div style={{
                  fontSize: 20, fontWeight: 500,
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.02em", marginBottom: 6,
                }}>
                  GeoLLM
                </div>
                <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: 380 }}>
                  Upload a soil investigation report or boring log, then ask questions about SPT values, soil classification, and foundation recommendations.
                </div>
              </div>

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
                <span style={{ fontSize: 12 }}>PDF, TXT · or drag & drop</span>
              </button>

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
          {!uploadedDoc && !isEmpty && (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 12, color: "var(--color-text-tertiary)", padding: "0 0 10px",
              }}
            >
              <FileIcon />
              Upload report
            </button>
          )}

          <div style={{
            display: "flex", alignItems: "flex-end", gap: 8,
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
                flex: 1, background: "none", border: "none",
                fontSize: 14, color: "var(--color-text-primary)",
                lineHeight: 1.6, fontFamily: "var(--font-sans)",
                minHeight: 24, maxHeight: 160, overflow: "auto",
              }}
            />
            <button
              onClick={isStreaming ? stopStreaming : () => sendMessage()}
              disabled={!isStreaming && !input.trim()}
              style={{
                width: 34, height: 34, borderRadius: 8, border: "none",
                background: isStreaming
                  ? "var(--color-background-danger)"
                  : input.trim() ? "#1D9E75" : "var(--color-background-secondary)",
                color: isStreaming
                  ? "var(--color-text-danger)"
                  : input.trim() ? "#fff" : "var(--color-text-tertiary)",
                cursor: (!isStreaming && !input.trim()) ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "background 0.15s, color 0.15s",
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
              ? "⚠ Ollama not running — start with: ollama serve && ollama pull llama3.2:3b"
              : "Shift+Enter for new line · runs on llama3.2:3b via Ollama"}
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
    </>
  );
}
