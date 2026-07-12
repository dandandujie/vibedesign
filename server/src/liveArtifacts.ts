import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync, unlinkSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { moduleDir, dataDir } from "./paths.js";
import { getStreamFn, ProviderConfig } from "./providers/index.js";
import { readJsonFile, writeJsonAtomic } from "./jsonFile.js";

// Live Artifacts (MVP): a design output whose presentation (templateHtml) and
// data (dataJson) are stored separately. The data layer can be "refreshed" —
// re-run a read-only source, write it back, re-render — without changing the
// design and without the model re-drawing anything.

const DATA_DIR = dataDir(join(moduleDir, "..", ".data"));
const FILE = join(DATA_DIR, "live-artifacts.json");

// A field mapping from the raw source payload into the artifact's data shape.
// `transform` massages the picked value before it is written (open-design parity):
//   identity        — write as-is (default)
//   compact_table   — array of objects → { columns: string[], rows: string[][] }
//   metric_summary  — array of numbers → { count, min, max, avg, last }
export type LiveTransform = "identity" | "compact_table" | "metric_summary";
export interface LiveMapping {
  from: string;
  to: string;
  transform?: LiveTransform;
}

export type LiveSource =
  | { type: "http_json"; url: string; mapping?: LiveMapping[] }
  | { type: "model_prompt"; prompt: string }
  // Read a JSON file the user dropped in the sandboxed .data/live-sources/ dir
  // (no arbitrary filesystem access — name only, .json only, size-capped).
  | { type: "local_file"; file: string; mapping?: LiveMapping[] }
  // A curated, read-only public connector (safer than raw http_json: fixed host
  // + shape). See CONNECTORS below.
  | { type: "connector"; connector: string; params?: Record<string, string>; mapping?: LiveMapping[] };

// Where the current data came from — shown in the viewer's Provenance tab so a
// refreshed number is always traceable to its source.
export interface LiveProvenance {
  generatedBy: string; // "http_json" | "model_prompt" | "local_file" | "connector:<id>"
  sources: { label: string; type: string; ref?: string }[];
  refreshedAt: number;
  refreshId?: string;
  note?: string;
}

export interface LiveArtifact {
  id: string;
  projectId: string;
  title: string;
  templateHtml: string; // HTML with {{data.path}} holes
  dataJson: unknown; // current data (authoritative)
  source?: LiveSource; // how to refresh; absent = not refreshable
  provenance?: LiveProvenance; // where the current data came from
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
  return readJsonFile<LiveArtifact[]>(FILE, []);
}
function writeAll(list: LiveArtifact[]) {
  ensureDir();
  writeJsonAtomic(FILE, list);
}

export function listLiveArtifacts(projectId?: string): LiveArtifact[] {
  const all = readAll();
  return (projectId ? all.filter((a) => a.projectId === projectId) : all).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getLiveArtifact(id: string): LiveArtifact | undefined {
  return readAll().find((a) => a.id === id);
}
export function saveLiveArtifact(a: LiveArtifact): LiveArtifact {
  assertArtifactId(a.id);
  const all = readAll();
  a.updatedAt = Date.now();
  const i = all.findIndex((x) => x.id === a.id);
  if (i >= 0) all[i] = a;
  else all.push(a);
  writeAll(all);
  return a;
}
export function deleteLiveArtifact(id: string): void {
  assertArtifactId(id);
  writeAll(readAll().filter((a) => a.id !== id));
  const d = laDir(id);
  if (existsSync(d)) rmSync(d, { recursive: true, force: true });
}

// ---- per-artifact sidecar: lock, monotonic refreshId, audit log, snapshots --
// Each artifact gets .data/live-artifacts/<id>/ holding refresh-state.json,
// refresh.lock.json, refreshes.jsonl (append-only audit), and snapshots/<rid>/.

const LA_DIR = join(DATA_DIR, "live-artifacts");
const ARTIFACT_ID_RE = /^[a-zA-Z0-9_-]+$/;
const REFRESH_ID_RE = /^refresh-\d{6}$/;

export interface RefreshLogEntry {
  refreshId: string;
  event: "created" | "started" | "succeeded" | "failed" | "rolled_back";
  at: number;
  summary?: string; // e.g. data keys, or an error
}

function assertArtifactId(id: string): void {
  if (!ARTIFACT_ID_RE.test(id)) throw new Error("invalid live artifact id");
}

function assertRefreshId(refreshId: string): void {
  if (!REFRESH_ID_RE.test(refreshId)) throw new Error("invalid refresh id");
}

function resolveInside(root: string, ...parts: string[]): string {
  const base = resolve(root);
  const target = resolve(base, ...parts);
  if (target === base || !target.startsWith(base + sep)) throw new Error("sidecar path escapes live artifact directory");
  return target;
}

function laDir(id: string): string {
  assertArtifactId(id);
  return resolveInside(LA_DIR, id);
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
  let counter = readJsonFile<{ counter?: number }>(stateFile, {}).counter ?? 0;
  counter += 1;
  const refreshId = "refresh-" + String(counter).padStart(6, "0");
  assertRefreshId(refreshId);
  writeJsonAtomic(stateFile, { counter });
  return refreshId;
}

// Exclusive lock via wx (fail if exists) — blocks concurrent refreshes.
function acquireLock(id: string, refreshId: string): void {
  assertRefreshId(refreshId);
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
  assertRefreshId(refreshId);
  const snapDir = resolveInside(ensureLaDir(id), "snapshots", refreshId);
  mkdirSync(snapDir, { recursive: true });
  writeJsonAtomic(join(snapDir, "data.json"), data);
}
export function readSnapshot(id: string, refreshId: string): unknown {
  assertRefreshId(refreshId);
  const f = resolveInside(laDir(id), "snapshots", refreshId, "data.json");
  if (!existsSync(f)) return undefined;
  return readJsonFile<unknown>(f, undefined);
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
  if (!parts.length) throw new Error("mapping target path is empty");
  for (const part of parts) {
    if (FORBIDDEN_PATH_SEGMENTS.has(part)) throw new Error(`mapping target contains forbidden path segment: ${part}`);
  }
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== "object" || cur[k] == null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

const FORBIDDEN_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

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

// ---- Data hardening (bounded JSON + safe fetch) ----------------------------
// Refresh data is model- or network-supplied, so bound it before it is ever
// persisted or rendered: cap shape/size and reject credential-shaped keys.
const JSON_LIMITS = { maxDepth: 8, maxObjectKeys: 200, maxArrayLength: 1000, maxString: 32 * 1024, maxSerialized: 512 * 1024 };
const FORBIDDEN_JSON_KEYS = new Set([
  "__proto__", "prototype", "constructor",
  "authorization", "cookie", "cookies", "token", "accesstoken", "refreshtoken",
  "secret", "apikey", "api_key", "password", "passwd", "credential", "credentials", "privatekey", "private_key",
]);

export function assertBoundedJson(data: unknown, where = "data"): void {
  const serialized = JSON.stringify(data ?? null);
  if (serialized.length > JSON_LIMITS.maxSerialized) {
    throw new Error(`${where} too large (${serialized.length}B > ${JSON_LIMITS.maxSerialized}B)`);
  }
  const walk = (v: unknown, depth: number): void => {
    if (depth > JSON_LIMITS.maxDepth) throw new Error(`${where} nested too deep (> ${JSON_LIMITS.maxDepth})`);
    if (typeof v === "string") {
      if (v.length > JSON_LIMITS.maxString) throw new Error(`${where} string too long (> ${JSON_LIMITS.maxString})`);
      return;
    }
    if (Array.isArray(v)) {
      if (v.length > JSON_LIMITS.maxArrayLength) throw new Error(`${where} array too long (> ${JSON_LIMITS.maxArrayLength})`);
      for (const item of v) walk(item, depth + 1);
      return;
    }
    if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (keys.length > JSON_LIMITS.maxObjectKeys) throw new Error(`${where} object has too many keys (> ${JSON_LIMITS.maxObjectKeys})`);
      for (const k of keys) {
        if (FORBIDDEN_JSON_KEYS.has(k.toLowerCase())) throw new Error(`${where} contains a forbidden key: ${k}`);
        walk((v as Record<string, unknown>)[k], depth + 1);
      }
    }
  };
  walk(data, 0);
}

// Block non-http(s) schemes and private/loopback/link-local hosts so a
// model-generated refresh URL can't be turned into an SSRF probe.
export function assertSafeHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("refresh source url is not a valid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("refresh source url must be http(s)");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^(0|fc|fd)[0-9a-f]*:/i.test(host); // ULA / unspecified IPv6
  if (blocked) throw new Error(`refresh source url points at a private/loopback host (${host})`);
  return u;
}

const HTTP_JSON_TIMEOUT_MS = 30_000;
const HTTP_JSON_MAX_BYTES = 2 * 1024 * 1024; // cap the response body
const HTTP_JSON_MAX_REDIRECTS = 5;

// Massage a picked value before it is written into the data shape.
function applyTransform(value: unknown, kind: LiveTransform | undefined): unknown {
  if (!kind || kind === "identity") return value;
  if (!Array.isArray(value)) return value; // transforms only make sense on arrays
  if (kind === "compact_table") {
    const rows = value.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];
    if (!rows.length) return { columns: [], rows: [] };
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).slice(0, 12);
    return { columns, rows: rows.slice(0, 100).map((r) => columns.map((c) => String(r[c] ?? ""))) };
  }
  if (kind === "metric_summary") {
    const nums = value.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    if (!nums.length) return { count: 0 };
    const sum = nums.reduce((a, b) => a + b, 0);
    return { count: nums.length, min: Math.min(...nums), max: Math.max(...nums), avg: Math.round((sum / nums.length) * 100) / 100, last: nums[nums.length - 1] };
  }
  return value;
}

// Shared: pick fields from a raw payload into the artifact's data shape,
// applying per-field transforms. No mapping ⇒ the raw payload becomes the data.
function applyMapping(raw: unknown, currentData: unknown, mapping: LiveMapping[] | undefined): unknown {
  if (!mapping || mapping.length === 0) return raw;
  const out: Record<string, unknown> = JSON.parse(JSON.stringify(currentData ?? {}));
  for (const m of mapping) {
    const v = resolvePath(raw, m.from.startsWith(".") ? m.from : "." + m.from);
    if (v !== undefined) setByPath(out, m.to, applyTransform(v, m.transform)); // keep prior value if source omits it
  }
  return out;
}

// Fetch a public JSON endpoint with the byte cap + timeout applied.
async function fetchBoundedJson(url: string): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), HTTP_JSON_TIMEOUT_MS);
  try {
    let current = assertSafeHttpUrl(url);
    let res: Response | undefined;
    for (let redirects = 0; redirects <= HTTP_JSON_MAX_REDIRECTS; redirects++) {
      res = await fetch(current, { headers: { accept: "application/json" }, redirect: "manual", signal: ac.signal });
      if (![301, 302, 303, 307, 308].includes(res.status)) break;
      if (redirects === HTTP_JSON_MAX_REDIRECTS) throw new Error(`source redirected more than ${HTTP_JSON_MAX_REDIRECTS} times`);
      const location = res.headers.get("location");
      if (!location) throw new Error(`source redirect ${res.status} missing location`);
      current = assertSafeHttpUrl(new URL(location, current).href);
    }
    if (!res) throw new Error("source request failed");
    if (!res.ok) throw new Error(`source returned ${res.status}`);
    if (!res.body) throw new Error("source response has no body");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > HTTP_JSON_MAX_BYTES) {
          await reader.cancel();
          throw new Error(`source response too large (> ${HTTP_JSON_MAX_BYTES}B)`);
        }
        chunks.push(value);
      }
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error(`source timed out after ${HTTP_JSON_TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function runHttpJson(src: Extract<LiveSource, { type: "http_json" }>, currentData: unknown): Promise<unknown> {
  return applyMapping(await fetchBoundedJson(src.url), currentData, src.mapping);
}

// ---- local_file: a sandboxed JSON drop-dir ---------------------------------
// Users drop <name>.json into .data/live-sources/; a live artifact can refresh
// from it. No arbitrary paths: name is [a-zA-Z0-9_-], .json only, 256KB cap.
const LIVE_SOURCES_DIR = join(DATA_DIR, "live-sources");
export function liveSourcesDir(): string {
  if (!existsSync(LIVE_SOURCES_DIR)) mkdirSync(LIVE_SOURCES_DIR, { recursive: true });
  return LIVE_SOURCES_DIR;
}
export function listLocalSources(): string[] {
  if (!existsSync(LIVE_SOURCES_DIR)) return [];
  return readdirSync(LIVE_SOURCES_DIR).filter((f) => f.endsWith(".json"));
}
async function runLocalFile(src: Extract<LiveSource, { type: "local_file" }>, currentData: unknown): Promise<unknown> {
  const name = String(src.file || "").trim();
  if (!/^[a-zA-Z0-9_-]+\.json$/.test(name)) throw new Error("local_file must be a plain <name>.json in the drop dir");
  const full = join(liveSourcesDir(), name);
  if (!existsSync(full)) throw new Error(`local source not found: ${name} (drop it in .data/live-sources/)`);
  const raw = readFileSync(full, "utf8");
  if (raw.length > 256 * 1024) throw new Error("local source too large (> 256KB)");
  return applyMapping(JSON.parse(raw), currentData, src.mapping);
}

// ---- connectors: curated, read-only public data sources --------------------
// A safer alternative to raw http_json: fixed host + known shape + read-only
// safety class. The connector's URL is built from typed params, never freeform.
// (Vibedesign is a local BYOK tool with no credential vault, so connectors are
// public/read-only only — no OAuth/write/destructive tiers.)
export interface ConnectorDef {
  id: string;
  label: string;
  description: string;
  safety: "read_only"; // only class supported here
  params: { name: string; label: string; required?: boolean; default?: string }[];
  buildUrl: (params: Record<string, string>) => string;
}
export const CONNECTORS: ConnectorDef[] = [
  {
    id: "github_repo",
    label: "GitHub repo stats",
    description: "Stars / forks / open issues / description for a public repo.",
    safety: "read_only",
    params: [{ name: "repo", label: "owner/name", required: true, default: "facebook/react" }],
    buildUrl: (p) => `https://api.github.com/repos/${encodeURIComponent(p.repo || "").replace(/%2F/gi, "/")}`,
  },
  {
    id: "hn_top",
    label: "Hacker News front page",
    description: "Top stories (ids) from Hacker News.",
    safety: "read_only",
    params: [],
    buildUrl: () => "https://hacker-news.firebaseio.com/v0/topstories.json",
  },
  {
    id: "crypto_price",
    label: "Crypto spot price",
    description: "Current USD price for a coin (CoinGecko public API).",
    safety: "read_only",
    params: [{ name: "coin", label: "coin id", required: true, default: "bitcoin" }],
    buildUrl: (p) => `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(p.coin || "bitcoin")}&vs_currencies=usd`,
  },
];
export function listConnectors(): Omit<ConnectorDef, "buildUrl">[] {
  return CONNECTORS.map(({ buildUrl: _drop, ...rest }) => rest);
}
async function runConnector(src: Extract<LiveSource, { type: "connector" }>, currentData: unknown): Promise<unknown> {
  const def = CONNECTORS.find((c) => c.id === src.connector);
  if (!def) throw new Error(`unknown connector: ${src.connector}`);
  const params = src.params ?? {};
  for (const p of def.params) if (p.required && !params[p.name]) throw new Error(`connector ${def.id} requires param: ${p.name}`);
  const url = def.buildUrl(params);
  return applyMapping(await fetchBoundedJson(url), currentData, src.mapping); // buildUrl is fixed-host; still passes the SSRF/size guard
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
    switch (a.source.type) {
      case "http_json":
        next = await runHttpJson(a.source, a.dataJson);
        break;
      case "local_file":
        next = await runLocalFile(a.source, a.dataJson);
        break;
      case "connector":
        next = await runConnector(a.source, a.dataJson);
        break;
      case "model_prompt":
        if (!provider) throw new Error("no model provider configured for model_prompt refresh");
        next = await runModelPrompt(a.source.prompt, a.dataJson, provider);
        break;
    }
    // all-or-nothing: bound the (model/network-supplied) data, then only commit
    // if it renders cleanly.
    assertBoundedJson(next, "refreshed data");
    renderLiveHtml(a.templateHtml, next);
    writeSnapshot(id, refreshId, next); // committed snapshot (rollback target)
    a.dataJson = next;
    a.provenance = sourceProvenance(a.source, refreshId);
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

// Build a provenance record describing where a refresh's data came from.
function sourceProvenance(source: LiveSource, refreshId: string): LiveProvenance {
  const at = Date.now();
  switch (source.type) {
    case "http_json":
      return { generatedBy: "http_json", sources: [{ label: new URL(source.url).host, type: "http_json", ref: source.url }], refreshedAt: at, refreshId };
    case "local_file":
      return { generatedBy: "local_file", sources: [{ label: source.file, type: "local_file", ref: source.file }], refreshedAt: at, refreshId };
    case "connector": {
      const def = CONNECTORS.find((c) => c.id === source.connector);
      return { generatedBy: `connector:${source.connector}`, sources: [{ label: def?.label ?? source.connector, type: "connector", ref: source.connector }], refreshedAt: at, refreshId };
    }
    case "model_prompt":
      return { generatedBy: "model_prompt", sources: [{ label: "model-generated", type: "model_prompt" }], refreshedAt: at, refreshId, note: "values synthesized by the model" };
  }
}

// Record the creation baseline: snapshot the initial data as refresh-000000
// (so the user can always roll back to the original) and log a 'created' event.
export function initLiveArtifactAudit(a: LiveArtifact): void {
  writeSnapshot(a.id, "refresh-000000", a.dataJson);
  appendRefreshLog(a.id, { refreshId: "refresh-000000", event: "created", at: a.createdAt, summary: dataSummary(a.dataJson) });
  // baseline provenance: the initial values, before any refresh
  a.provenance = { generatedBy: "initial", sources: [{ label: "initial values", type: "seed" }], refreshedAt: a.createdAt, refreshId: "refresh-000000" };
  saveLiveArtifact(a);
}
