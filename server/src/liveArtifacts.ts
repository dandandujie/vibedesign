import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { moduleDir, dataDir } from "./paths.js";
import { getStreamFn, ProviderConfig } from "./providers/index.js";

// Live Artifacts (MVP): a design output whose presentation (templateHtml) and
// data (dataJson) are stored separately. The data layer can be "refreshed" —
// re-run a read-only source, write it back, re-render — without changing the
// design and without the model re-drawing anything.

const DATA_DIR = dataDir(join(moduleDir, "..", ".data"));
const FILE = join(DATA_DIR, "live-artifacts.json");

export type LiveSource =
  | { type: "http_json"; url: string; mapping?: { from: string; to: string }[] }
  | { type: "model_prompt"; prompt: string };

export interface LiveArtifact {
  id: string;
  projectId: string;
  title: string;
  templateHtml: string; // HTML with {{data.path}} holes
  dataJson: unknown; // current data (authoritative)
  source?: LiveSource; // how to refresh; absent = not refreshable
  refreshStatus: "idle" | "running" | "succeeded" | "failed";
  refreshError?: string;
  createdAt: number;
  updatedAt: number;
  lastRefreshedAt?: number;
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}
function readAll(): LiveArtifact[] {
  ensureDir();
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}
function writeAll(list: LiveArtifact[]) {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(list, null, 2));
}

export function listLiveArtifacts(projectId?: string): LiveArtifact[] {
  const all = readAll();
  return (projectId ? all.filter((a) => a.projectId === projectId) : all).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getLiveArtifact(id: string): LiveArtifact | undefined {
  return readAll().find((a) => a.id === id);
}
export function saveLiveArtifact(a: LiveArtifact): LiveArtifact {
  const all = readAll();
  a.updatedAt = Date.now();
  const i = all.findIndex((x) => x.id === a.id);
  if (i >= 0) all[i] = a;
  else all.push(a);
  writeAll(all);
  return a;
}
export function deleteLiveArtifact(id: string): void {
  writeAll(readAll().filter((a) => a.id !== id));
  const d = join(DATA_DIR, "live-artifacts", id.replace(/[^a-zA-Z0-9_-]/g, "_"));
  if (existsSync(d)) rmSync(d, { recursive: true, force: true });
}

// ---- per-artifact sidecar: lock, monotonic refreshId, audit log, snapshots --
// Each artifact gets .data/live-artifacts/<id>/ holding refresh-state.json,
// refresh.lock.json, refreshes.jsonl (append-only audit), and snapshots/<rid>/.

const LA_DIR = join(DATA_DIR, "live-artifacts");

export interface RefreshLogEntry {
  refreshId: string;
  event: "created" | "started" | "succeeded" | "failed" | "rolled_back";
  at: number;
  summary?: string; // e.g. data keys, or an error
}

function laDir(id: string): string {
  return join(LA_DIR, id.replace(/[^a-zA-Z0-9_-]/g, "_"));
}
function ensureLaDir(id: string): string {
  const d = laDir(id);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

// Monotonic refresh id — survives restarts, never reused (prevents stale writes).
function nextRefreshId(id: string): string {
  const d = ensureLaDir(id);
  const stateFile = join(d, "refresh-state.json");
  let counter = 0;
  try {
    counter = JSON.parse(readFileSync(stateFile, "utf8")).counter ?? 0;
  } catch {
    /* first refresh */
  }
  counter += 1;
  writeFileSync(stateFile, JSON.stringify({ counter }));
  return "refresh-" + String(counter).padStart(6, "0");
}

// Exclusive lock via wx (fail if exists) — blocks concurrent refreshes.
function acquireLock(id: string, refreshId: string): void {
  const lock = join(ensureLaDir(id), "refresh.lock.json");
  try {
    writeFileSync(lock, JSON.stringify({ refreshId, at: Date.now(), pid: process.pid }), { flag: "wx" });
  } catch {
    throw new Error("REFRESH_LOCKED: a refresh is already in progress");
  }
}
function releaseLock(id: string): void {
  const lock = join(laDir(id), "refresh.lock.json");
  if (existsSync(lock)) {
    try {
      unlinkSync(lock);
    } catch {
      /* ignore */
    }
  }
}

function appendRefreshLog(id: string, entry: RefreshLogEntry): void {
  appendFileSync(join(ensureLaDir(id), "refreshes.jsonl"), JSON.stringify(entry) + "\n");
}

export function readRefreshLog(id: string): RefreshLogEntry[] {
  const f = join(laDir(id), "refreshes.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as RefreshLogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is RefreshLogEntry => e !== null);
}

function writeSnapshot(id: string, refreshId: string, data: unknown): void {
  const snapDir = join(ensureLaDir(id), "snapshots", refreshId);
  mkdirSync(snapDir, { recursive: true });
  writeFileSync(join(snapDir, "data.json"), JSON.stringify(data, null, 2));
}
export function readSnapshot(id: string, refreshId: string): unknown {
  const f = join(laDir(id), "snapshots", refreshId, "data.json");
  if (!existsSync(f)) return undefined;
  return JSON.parse(readFileSync(f, "utf8"));
}

// Startup recovery: any artifact stuck "running" (server died mid-refresh) is
// marked failed and its stale lock cleared, so refresh is available again.
export function recoverStaleLiveRefreshes(): number {
  let n = 0;
  for (const a of readAll()) {
    if (a.refreshStatus === "running") {
      a.refreshStatus = "failed";
      a.refreshError = "interrupted (server restart)";
      saveLiveArtifact(a);
      releaseLock(a.id);
      appendRefreshLog(a.id, { refreshId: "-", event: "failed", at: Date.now(), summary: "interrupted by restart" });
      n++;
    } else {
      releaseLock(a.id); // clear any orphan lock from a clean idle state
    }
  }
  return n;
}

// ---- rendering: template + data → HTML ------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function resolvePath(data: unknown, path: string): unknown {
  // path like ".a.b.0.c" (leading dot already stripped of "data")
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = data;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

// Reject anything that could execute in the preview — live artifacts render
// server-side under a strict CSP; the template is presentation only.
export function validateTemplateSecurity(html: string): void {
  const bad = [/<script[\s>]/i, /[\s/]on[a-z]+\s*=/i, /javascript:/i, /srcdoc\s*=/i, /<iframe[\s>]/i];
  for (const re of bad) if (re.test(html)) throw new Error("template contains disallowed executable content");
}

export function renderLiveHtml(templateHtml: string, data: unknown): string {
  validateTemplateSecurity(templateHtml);
  return templateHtml.replace(/\{\{\s*data((?:\.[a-zA-Z0-9_]+)*)\s*\}\}/g, (_full, path: string) => {
    const v = resolvePath(data, path);
    return escapeHtml(v == null ? "" : String(v));
  });
}

// ---- refresh: run the source, write data back -----------------------------

function setByPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".").filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== "object" || cur[k] == null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function extractJson(text: string): unknown {
  // tolerate a fenced ```json block or raw JSON with surrounding prose
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model response");
  return JSON.parse(body.slice(start, end + 1));
}

async function runModelPrompt(prompt: string, currentData: unknown, provider: ProviderConfig): Promise<unknown> {
  const system =
    "You refresh the data behind a live design artifact. Return ONLY a JSON object with the SAME SHAPE as the " +
    "current data below (same keys/structure), filled with fresh values. No prose, no markdown, JSON only.\n\n" +
    "Current data:\n" +
    JSON.stringify(currentData, null, 2);
  const streamFn = getStreamFn(provider.format);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90_000);
  let acc = "";
  try {
    for await (const evt of streamFn({ system, messages: [{ role: "user", content: prompt }], config: provider, signal: ac.signal })) {
      if (evt.type === "text") acc += evt.text;
      else if (evt.type === "error") throw new Error(evt.error);
      else if (evt.type === "done") break;
    }
  } finally {
    clearTimeout(timer);
  }
  return extractJson(acc);
}

async function runHttpJson(src: Extract<LiveSource, { type: "http_json" }>, currentData: unknown): Promise<unknown> {
  const res = await fetch(src.url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`source returned ${res.status}`);
  const json = await res.json();
  if (!src.mapping || src.mapping.length === 0) return json;
  const out: Record<string, unknown> = JSON.parse(JSON.stringify(currentData ?? {}));
  for (const m of src.mapping) {
    const v = resolvePath(json, m.from.startsWith(".") ? m.from : "." + m.from);
    if (v !== undefined) setByPath(out, m.to, v); // keep the prior value if the source omits it
  }
  return out;
}

export async function refreshLiveArtifact(id: string, provider?: ProviderConfig): Promise<LiveArtifact> {
  const a = getLiveArtifact(id);
  if (!a) throw new Error("live artifact not found");
  if (!a.source) throw new Error("this live artifact has no refresh source");

  const refreshId = nextRefreshId(id);
  acquireLock(id, refreshId); // throws REFRESH_LOCKED if one is already running
  const now0 = Date.now();
  a.refreshStatus = "running";
  a.refreshError = undefined;
  saveLiveArtifact(a);
  appendRefreshLog(id, { refreshId, event: "started", at: now0 });
  try {
    let next: unknown;
    if (a.source.type === "http_json") next = await runHttpJson(a.source, a.dataJson);
    else {
      if (!provider) throw new Error("no model provider configured for model_prompt refresh");
      next = await runModelPrompt(a.source.prompt, a.dataJson, provider);
    }
    // all-or-nothing: only commit if the new data renders cleanly
    renderLiveHtml(a.templateHtml, next);
    writeSnapshot(id, refreshId, next); // committed snapshot (rollback target)
    a.dataJson = next;
    a.refreshStatus = "succeeded";
    a.lastRefreshedAt = Date.now();
    saveLiveArtifact(a);
    appendRefreshLog(id, { refreshId, event: "succeeded", at: Date.now(), summary: dataSummary(next) });
    return a;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    a.refreshStatus = "failed";
    a.refreshError = msg;
    saveLiveArtifact(a); // keep old dataJson untouched
    appendRefreshLog(id, { refreshId, event: "failed", at: Date.now(), summary: msg });
    throw err;
  } finally {
    releaseLock(id);
  }
}

// Restore the data from a past successful refresh snapshot (non-destructive:
// records the rollback in the audit log; the design/template is unchanged).
export function rollbackLiveArtifact(id: string, refreshId: string): LiveArtifact {
  const a = getLiveArtifact(id);
  if (!a) throw new Error("live artifact not found");
  const snap = readSnapshot(id, refreshId);
  if (snap === undefined) throw new Error("snapshot not found");
  renderLiveHtml(a.templateHtml, snap); // must still render with the current template
  a.dataJson = snap;
  a.refreshStatus = "succeeded";
  a.refreshError = undefined;
  saveLiveArtifact(a);
  appendRefreshLog(id, { refreshId, event: "rolled_back", at: Date.now(), summary: `restored ${refreshId}` });
  return a;
}

function dataSummary(data: unknown): string {
  if (data && typeof data === "object") return "keys: " + Object.keys(data as object).slice(0, 12).join(", ");
  return String(data).slice(0, 60);
}

// Record the creation baseline: snapshot the initial data as refresh-000000
// (so the user can always roll back to the original) and log a 'created' event.
export function initLiveArtifactAudit(a: LiveArtifact): void {
  writeSnapshot(a.id, "refresh-000000", a.dataJson);
  appendRefreshLog(a.id, { refreshId: "refresh-000000", event: "created", at: a.createdAt, summary: dataSummary(a.dataJson) });
}
