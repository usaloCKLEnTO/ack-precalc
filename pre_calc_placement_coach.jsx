import React, { useEffect, useMemo, useRef, useState } from "react";
import YAML from "yaml";

/**
 * Pre‑Calc Placement Coach — Single‑File React App
 * -------------------------------------------------
 * Minimal, no-backend single-page UI that orchestrates an 8‑stage, NEXT‑gated
 * tutoring flow using a single controller prompt as the System message.
 *
 * How to use:
 * 1) Open Settings (⚙️), paste an API key and pick a base URL + model.
 *    - OpenAI:    https://api.openai.com/v1  (Authorization: Bearer <key>)
 *    - OpenRouter: https://openrouter.ai/api/v1 (Bearer <key>)
 *    - Local (Ollama-compatible): http://localhost:11434/v1 (no key needed if configured)
 * 2) Click “Start Session” to send the controller prompt and begin at Stage 0.
 * 3) Use buttons to send NEXT or STATE, or type free‑text questions.
 * 4) Toggle the YAML STATE by sending the literal word STATE (assistant controls visibility).
 *
 * Notes:
 * - The authoritative STATE is produced by the LLM. This UI only displays it.
 * - Transcript + settings are persisted in localStorage for convenience.
 */

// ------------------------------ Controller Prompt ------------------------------
const CONTROLLER_PROMPT = `
SYSTEM / CONTROLLER INSTRUCTIONS — “Pre-Calc Placement Coach”

GOAL
Coach a student for a pre-calculus placement test by revealing EXACTLY ONE stage per turn, carrying a compact YAML STATE forward, and finishing with: (1) a one-page cram plan, (2) a prioritized drill list, and (3) day-before/test-day checklists. reasoning_effort = medium.

COMMANDS (student)
- NEXT  → advance to the next stage
- STATE → toggle showing/hiding the YAML STATE
Any other input = question; answer briefly and stay on the current stage.

VISIBILITY
Default: do NOT show STATE. If the student typed STATE on the prior turn, show the compact STATE at the end of the stage and remind them they can type STATE again to hide it.

TOPIC TAXONOMY
functions & transformations; equations & inequalities; systems; polynomials & factoring; rational expressions; exponentials & logs; trig basics (radians, unit circle, identities); sequences/series; graphing & asymptotes.

BRANCH THRESHOLDS
NeedsWork <70%; OK 70–85%; Strong >85%. After Diagnostic, select 2–3 NeedsWork topics as today’s targets. Drills: for a topic, two consecutive sets ≥80% → promote (OK/Strong). After Mini-Exam: if overall <80% OR any target <75%, add a gap with one concrete remedy and schedule a small booster.

STATE (carry forward verbatim; only render when visible)
STATE:
  meta: {student_name:"", test_date:"", session_date:"", time_available_min:60, calculator_policy:"standard", anxiety_points:[]}
  progress: {current_stage:0, stages_total:8, state_visible:false}
  diagnostic: {topic_scores:{}, priorities:[]}
  goals: {targets:[], success_criteria:[]}
  plan: {blocks:[]}
  drills: {sets:[], mastery_flags:{}}
  mini_exam: {score_pct:null, time_used_min:null, per_topic:{}, flagged_items:[]}
  gaps: {items:[]}
  actions: {today:[], day_before:[], test_day:[]}

OUTPUT STYLE
• Show ONLY the current stage. Be concise and actionable.
• End every stage with: “Type NEXT to continue, or STATE to toggle the YAML state view.”

STAGES (fixed order and behavior)

Stage 0 — Onboarding & Constraints
- Ask for: name (optional), test_date, time_available_min today, calculator_policy (if any), 1–2 anxiety_points.
- Summarize captured details in 3–5 bullets.
- Update STATE.meta, progress.current_stage=0.
- Footer.

Stage 1 — Micro-Diagnostic (6–8 quick items)
- Present brief, varied items across taxonomy (short stems). After student answers, give tight feedback and compute per-topic hit/miss.
- Update STATE.diagnostic.topic_scores and select 2–3 weakest priorities → STATE.diagnostic.priorities.
- Footer.

Stage 2 — Goals & Success Criteria
- Propose 2–3 focus topics (from priorities) and 2–3 measurable success_criteria (e.g., “≥80% on drills for rational expressions”).
- Ask for confirm/edit; update STATE.goals.
- Footer.

Stage 3 — Plan Builder (today)
- Produce 2–3 timed blocks (e.g., 3×20 min): {topic, duration, resource type, success_check}.
- Update STATE.plan.blocks.
- Footer.

Stage 4 — Targeted Drills
- For each target topic, run one short set (3–5 items), then immediate feedback and a mastery flag (NeedsWork/OK/Strong).
- If time remains per plan, propose the next micro-set; otherwise proceed.
- Update STATE.drills.sets and mastery_flags.
- Footer.

Stage 5 — Mini-Exam (12–15 items)
- Timed pacing cues; then score overall and per-topic.
- Update STATE.mini_exam (score_pct, time_used_min, per_topic, flagged_items).
- Footer.

Stage 6 — Gap Analysis → Fix-List
- List each misconception plainly; attach EXACTLY ONE remedy (rule/tip or micro-drill).
- If Mini-Exam <80% or any target <75%, schedule a small booster in Actions.today.
- Update STATE.gaps and actions.today.
- Footer.

Stage 7 — Final Deliverables
- Deliver: (1) one-page cram plan; (2) prioritized drill list; (3) day-before routine; (4) test-day pacing + quick formulas; (5) mindset cues.
- Update STATE.actions.day_before and STATE.actions.test_day.
- End with: “You’re done. Type STATE to view/save your final plan.”

END-OF-STAGE FOOTER (always)
Type NEXT to continue, or STATE to toggle the YAML state view.
`;

// ------------------------------ Helpers: Local Storage ------------------------------
const LS_KEYS = {
  settings: "pcpc_settings_v1",
  transcript: "pcpc_transcript_v1",
  lastYaml: "pcpc_state_yaml_v1",
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEYS.settings);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(LS_KEYS.settings, JSON.stringify(s));
  } catch {}
}

function loadTranscript() {
  try {
    const raw = localStorage.getItem(LS_KEYS.transcript);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveTranscript(t) {
  try {
    localStorage.setItem(LS_KEYS.transcript, JSON.stringify(t));
  } catch {}
}

function saveLastYaml(y) {
  try {
    localStorage.setItem(LS_KEYS.lastYaml, y || "");
  } catch {}
}

// ------------------------------ Helpers: YAML extraction ------------------------------
function extractStateYaml(text) {
  // Find the last fenced code block that contains a line starting with "STATE:"
  const codeBlockRegex = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  let match;
  let lastYaml = null;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const block = match[1];
    if (/^\s*STATE\s*:/m.test(block)) {
      lastYaml = block.trim();
    }
  }
  return lastYaml; // may be null
}

function parseStageProgress(yamlText) {
  if (!yamlText) return { current: null, total: 8 };
  const m1 = /progress:\s*{[^}]*current_stage:\s*(\d+)/.exec(yamlText);
  const m2 = /progress:\s*{[^}]*stages_total:\s*(\d+)/.exec(yamlText);
  return {
    current: m1 ? Number(m1[1]) : null,
    total: m2 ? Number(m2[1]) : 8,
  };
}

// ------------------------------ LLM client (OpenAI-compatible) ------------------------------
async function callChatCompletions({ baseUrl, apiKey, model, messages }) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const body = {
    model,
    messages,
    temperature: 0.2,
    stream: false,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return text;
}

// ------------------------------ Small UI primitives ------------------------------
function IconButton({ children, onClick, title, className = "", disabled = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 shadow-sm border border-slate-300 ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50 active:scale-[0.99]"} transition ${className}`}
    >
      {children}
    </button>
  );
}

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-[min(680px,92vw)] rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
        {children}
      </div>
    </div>
  );
}

// ------------------------------ Main App ------------------------------
export default function App() {
  // Settings
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [magicCopied, setMagicCopied] = useState(false);

  // Conversation
  const [messages, setMessages] = useState(() => loadTranscript() ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastActionRef = useRef(0);

  // State drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastYaml, setLastYaml] = useState(() => localStorage.getItem(LS_KEYS.lastYaml) || "");

  const transcriptEndRef = useRef(null);

  // Load saved settings once
  useEffect(() => {
    const s = loadSettings();
    if (s) {
      setApiKey(s.apiKey || "");
      setBaseUrl(s.baseUrl || "https://api.openai.com/v1");
      setModel(s.model || "gpt-4o-mini");
    }
    // Consume MagicLink config from URL fragment, if present
    try {
      const cfg = parseMagicLinkFromHash();
      if (cfg) {
        setBaseUrl(cfg.baseUrl || "");
        setModel(cfg.model || "");
        setApiKey(cfg.apiKey || "");
        saveSettings({ apiKey: cfg.apiKey || "", baseUrl: cfg.baseUrl || "", model: cfg.model || "" });
        // Remove the fragment to avoid lingering secrets in the address bar
        if (typeof history?.replaceState === "function") {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }
    } catch {}
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, drawerOpen]);

  // Persist transcript
  useEffect(() => {
    saveTranscript(messages);
  }, [messages]);

  // Persist last YAML
  useEffect(() => {
    saveLastYaml(lastYaml || "");
  }, [lastYaml]);

  // Derived: stage progress (best-effort parse)
  const stageInfo = useMemo(() => parseStageProgress(lastYaml), [lastYaml]);

  const hasSession = messages.length > 0;

  function canAct() {
    const now = Date.now();
    if (now - lastActionRef.current < 300) return false;
    lastActionRef.current = now;
    return true;
  }

  async function ensureSettings() {
    if (!baseUrl) throw new Error("Base URL is required");
    // Some providers (local) may not require an API key
    if (/openai\.com/.test(baseUrl) && !apiKey) {
      throw new Error("API key required for OpenAI base URL");
    }
  }

  function handleSaveSettings() {
    saveSettings({ apiKey, baseUrl, model });
    setSettingsOpen(false);
  }

  function downloadConfig() {
    const cfg = { baseUrl, model, apiKey };
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "precalc-config.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function tryParseConfig(text) {
    // Try JSON first
    try {
      const j = JSON.parse(text);
      if (j && (j.apiKey || j.baseUrl || j.model)) return j;
    } catch {}
    // Then YAML
    try {
      const y = YAML.parse(text);
      if (y && (y.apiKey || y.baseUrl || y.model)) return y;
    } catch {}
    return null;
  }

  function sanitizeConfig(obj) {
    if (!obj || typeof obj !== "object") return null;
    const next = {
      baseUrl: typeof obj.baseUrl === "string" && obj.baseUrl.trim() ? obj.baseUrl.trim() : baseUrl,
      model: typeof obj.model === "string" && obj.model.trim() ? obj.model.trim() : model,
      apiKey: typeof obj.apiKey === "string" ? obj.apiKey : apiKey,
    };
    return next;
  }

  async function onImportConfigFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const raw = tryParseConfig(text);
      if (!raw) throw new Error("Could not parse config (JSON or YAML)");
      const cfg = sanitizeConfig(raw);
      if (!cfg) throw new Error("Invalid config format");
      setBaseUrl(cfg.baseUrl || "");
      setModel(cfg.model || "");
      setApiKey(cfg.apiKey || "");
      saveSettings({ apiKey: cfg.apiKey || "", baseUrl: cfg.baseUrl || "", model: cfg.model || "" });
    } catch (e) {
      alert("Import failed: " + (e?.message || String(e)));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ------------------------------ MagicLink helpers ------------------------------
  function toBase64Url(str) {
    try {
      const b64 = btoa(unescape(encodeURIComponent(str)));
      return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    } catch {
      return "";
    }
  }

  function fromBase64Url(b64url) {
    try {
      let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4;
      if (pad) b64 += "=".repeat(4 - pad);
      const str = atob(b64);
      return decodeURIComponent(escape(str));
    } catch {
      return null;
    }
  }

  function buildMagicLink(cfg) {
    const json = JSON.stringify({ baseUrl: cfg.baseUrl, model: cfg.model, apiKey: cfg.apiKey });
    const enc = toBase64Url(json);
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#cfg=${enc}`;
  }

  function parseMagicLinkFromHash() {
    const h = window.location.hash || "";
    if (!h) return null;
    const m = h.match(/[#&]cfg=([A-Za-z0-9_\-]+)/);
    if (!m) return null;
    const json = fromBase64Url(m[1]);
    if (!json) return null;
    try {
      const obj = JSON.parse(json);
      return sanitizeConfig(obj);
    } catch {
      return null;
    }
  }

  async function copyMagicLink() {
    const link = buildMagicLink({ baseUrl, model, apiKey });
    try {
      await navigator.clipboard?.writeText(link);
      setMagicCopied(true);
      setTimeout(() => setMagicCopied(false), 1500);
    } catch (e) {
      // Fallback: show prompt
      window.prompt("Copy this Magic Link", link);
    }
  }

  async function startSession() {
    if (busy) return;
    if (!canAct()) return;
    try {
      setError("");
      await ensureSettings();
      const seed = [
        { role: "system", content: CONTROLLER_PROMPT },
        { role: "user", content: "Start. Please begin at Stage 0." },
      ];
      setMessages(seed);
      setBusy(true);
      const assistantText = await callChatCompletions({
        baseUrl,
        apiKey,
        model,
        messages: seed,
      });
      const yaml = extractStateYaml(assistantText);
      if (yaml) {
        setLastYaml(yaml);
        setDrawerOpen(true);
      }
      setMessages((m) => [...m, { role: "assistant", content: assistantText }]);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function sendUser(text) {
    if (!text.trim()) return;
    if (busy) return;
    if (!canAct()) return;
    // Local STATE toggle to avoid an API call when we already have YAML
    if (/^STATE$/i.test(text.trim())) {
      if (lastYaml && lastYaml.trim()) {
        setDrawerOpen((v) => !v);
        setInput("");
        return;
      }
    }
    try {
      setError("");
      await ensureSettings();
      const next = [...messages, { role: "user", content: text }];
      setMessages(next);
      setBusy(true);
      setInput("");
      const assistantText = await callChatCompletions({
        baseUrl,
        apiKey,
        model,
        messages: next,
      });
      const yaml = extractStateYaml(assistantText);
      if (yaml) {
        setLastYaml(yaml);
        setDrawerOpen(true);
      } else if (/\bSTATE\b/i.test(text)) {
        // If user asked to toggle STATE but no YAML appeared, close the drawer.
        setDrawerOpen(false);
        setLastYaml("");
      }
      setMessages((m) => [...m, { role: "assistant", content: assistantText }]);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  function resetSession() {
    setMessages([]);
    setLastYaml("");
    setDrawerOpen(false);
    setError("");
  }

  function downloadYaml() {
    if (!lastYaml) return;
    const blob = new Blob([lastYaml], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "precalc_state.yml";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/75 border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-indigo-600 text-white grid place-items-center font-bold">PC</div>
            <div>
              <div className="text-lg font-semibold">Pre‑Calc Placement Coach</div>
              <div className="text-xs text-slate-500">Stage‑gated tutor · NEXT / STATE</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-xs text-slate-500 mr-2">
              {stageInfo.current != null ? (
                <span>
                  Progress: <span className="font-medium">Stage {stageInfo.current} / {stageInfo.total}</span>
                </span>
              ) : (
                <span>Progress: <span className="font-medium">—</span></span>
              )}
            </div>
              <IconButton title="Settings" onClick={() => setSettingsOpen(true)} disabled={busy}>
                <span className="text-base">⚙️</span>
                <span className="text-sm">Settings</span>
              </IconButton>
              {!hasSession ? (
              <IconButton title="Start Session" onClick={startSession} className="bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700" disabled={busy}>
                <span className="text-base">▶</span>
                <span className="text-sm">Start Session</span>
              </IconButton>
              ) : (
              <IconButton title="Reset Session" onClick={resetSession}>
                <span className="text-base">⟳</span>
                <span className="text-sm">Reset</span>
              </IconButton>
              )}
            </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-6xl px-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 py-4">
        {/* Transcript */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 flex flex-col min-h-[60vh]">
          <div className="flex-1 overflow-auto pr-1">
            {messages.length === 0 && (
              <div className="text-sm text-slate-500 p-2">
                Click <span className="font-medium">Start Session</span> to begin at Stage 0. Configure your API key and model in <span className="font-medium">Settings</span> first.
              </div>
            )}
            {messages.map((m, idx) => (
              <MessageBubble key={idx} role={m.role} content={m.content} />
            ))}
            <div ref={transcriptEndRef} />
          </div>

          {/* Composer */}
          <div className="border-t border-slate-200 mt-3 pt-3">
            {error && (
              <div className="mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
            )}
            <div className="flex items-center gap-2">
              <IconButton title="Send NEXT" onClick={() => sendUser("NEXT")} disabled={busy}>
                <span>➡️</span>
                <span className="text-sm">NEXT</span>
              </IconButton>
              <IconButton title="Toggle STATE" onClick={() => sendUser("STATE") } disabled={busy}>
                <span>📄</span>
                <span className="text-sm">STATE</span>
              </IconButton>
              <input
                className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={busy ? "Sending…" : "Type a question, or use NEXT / STATE"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!busy) sendUser(input);
                  }
                }}
                disabled={busy}
              />
              <IconButton title="Send" onClick={() => sendUser(input)} className="bg-slate-900 text-white border-slate-900 hover:bg-slate-800" disabled={busy}>
                <span>✉️</span>
                <span className="text-sm">Send</span>
              </IconButton>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">Commands: <span className="font-medium">NEXT</span>, <span className="font-medium">STATE</span>. Free‑text questions are allowed; the assistant will not advance stages unless you send NEXT.</div>
          </div>
        </div>

        {/* State Drawer */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 h-fit sticky top-20">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">STATE (YAML)</div>
            <div className="flex items-center gap-2">
              <IconButton title="Download YAML" onClick={downloadYaml}>
                <span>⬇️</span>
                <span className="text-sm">Export</span>
              </IconButton>
              <IconButton title={drawerOpen ? "Hide" : "Show"} onClick={() => setDrawerOpen((v) => !v)}>
                <span>{drawerOpen ? "🙈" : "👀"}</span>
                <span className="text-sm">{drawerOpen ? "Hide" : "Show"}</span>
              </IconButton>
            </div>
          </div>
          {drawerOpen ? (
            lastYaml ? (
              <pre className="text-xs whitespace-pre-wrap leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto max-h-[60vh]">{lastYaml}</pre>
            ) : (
              <div className="text-xs text-slate-500">No STATE visible yet. Send <span className="font-medium">STATE</span> in the chat to toggle it on.</div>
            )
          ) : (
            <div className="text-xs text-slate-500">Hidden. Send <span className="font-medium">STATE</span> in the chat; if the assistant reveals STATE, it will show here.</div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold">Settings</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={() => setSettingsOpen(false)}>✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Base URL</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            >
              <option value="https://api.openai.com/v1">OpenAI — https://api.openai.com/v1</option>
              <option value="https://openrouter.ai/api/v1">OpenRouter — https://openrouter.ai/api/v1</option>
              <option value="http://localhost:11434/v1">Local (Ollama-compatible) — http://localhost:11434/v1</option>
              <option value={baseUrl}>Custom (keep current)</option>
            </select>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Or enter a custom base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Model</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g., gpt-4o-mini or llama3.1:8b (via local OpenAI-compatible server)"
            />
          </div>
          <div>
            <label className="text-sm font-medium">API Key</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key (not stored remotely)"
            />
            <div className="text-[11px] text-slate-500 mt-1">Stored only in your browser’s localStorage.</div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            {/* hidden file input for import */}
            <input
              type="file"
              accept=".json,.yml,.yaml,.txt,application/json,text/yaml"
              ref={fileInputRef}
              onChange={(e) => onImportConfigFile(e.target.files?.[0])}
              className="hidden"
            />
            <IconButton title="Export current config" onClick={downloadConfig}>
              <span>⬇️</span>
              <span className="text-sm">Export</span>
            </IconButton>
            <IconButton title="Import config file" onClick={() => fileInputRef.current?.click()}>
              <span>📁</span>
              <span className="text-sm">Import</span>
            </IconButton>
            <IconButton title="Copy Magic Link (stores config in #fragment)" onClick={copyMagicLink}>
              <span>🔗</span>
              <span className="text-sm">Magic Link{magicCopied ? " ✓" : ""}</span>
            </IconButton>
            <IconButton onClick={() => setSettingsOpen(false)}>Cancel</IconButton>
            <IconButton onClick={handleSaveSettings} className="bg-slate-900 text-white border-slate-900 hover:bg-slate-800">Save</IconButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MessageBubble({ role, content }) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isSystem = role === "system";
  const label = isUser ? "You" : isAssistant ? "Coach" : "System";

  // Basic rendering with code block support
  const parts = useMemo(() => splitIntoBlocks(content), [content]);

  return (
    <div className={`mb-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`${isUser ? "bg-indigo-600 text-white" : isSystem ? "bg-yellow-50 border border-yellow-200" : "bg-slate-100"} max-w-[90%] sm:max-w-[75%] rounded-2xl px-3 py-2 shadow-sm`}>
        <div className="text-[11px] opacity-80 mb-1">{label}</div>
        {parts.map((p, i) => (
          p.type === "code" ? (
            <pre key={i} className="text-xs whitespace-pre-wrap leading-relaxed bg-white/90 border border-slate-200 rounded-xl p-2 overflow-auto">
              {p.text}
            </pre>
          ) : (
            <div key={i} className="text-sm leading-relaxed whitespace-pre-wrap">{p.text}</div>
          )
        ))}
      </div>
    </div>
  );
}

function splitIntoBlocks(text) {
  // Very light markdown-ish splitting: ``` blocks vs paragraphs
  const re = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  const blocks = [];
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    if (before.trim()) blocks.push({ type: "text", text: before.trim() });
    blocks.push({ type: "code", text: m[1].trim() });
    lastIndex = m.index + m[0].length;
  }
  const tail = text.slice(lastIndex);
  if (tail.trim()) blocks.push({ type: "text", text: tail.trim() });
  return blocks.length ? blocks : [{ type: "text", text }];
}
