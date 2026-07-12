import express from "express";
import cors from "cors";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStreamFn, DEFAULT_BASE_URLS, ChatMessage, ProviderConfig } from "./providers/index.js";
import { buildSystem, listSkills } from "./brain.js";
import {
  getProviders,
  getProvider,
  getActiveProviderId,
  getProvidersMasked,
  upsertProvider,
  deleteProvider,
  setActiveProvider,
} from "./config.js";
import {
  listProjects,
  getProject,
  saveProject,
  deleteProject,
  listDesignSystems,
  getDesignSystem,
  saveDesignSystem,
  deleteDesignSystem,
  DesignSystem,
} from "./storage.js";
import {
  listLiveArtifacts,
  getLiveArtifact,
  saveLiveArtifact,
  deleteLiveArtifact,
  refreshLiveArtifact,
  rollbackLiveArtifact,
  readRefreshLog,
  recoverStaleLiveRefreshes,
  initLiveArtifactAudit,
  renderLiveHtml,
  assertBoundedJson,
  assertSafeHttpUrl,
  listConnectors,
  listLocalSources,
  LiveArtifact,
} from "./liveArtifacts.js";
import { renderMotionVideo, MotionRenderOpts } from "./motionRender.js";
import { renderScreenshot, ShotOpts } from "./screenshotRender.js";
import { serveMultiFile } from "./multiFile.js";
import { serveDeckAsset } from "./deckAssets.js";
import { moduleDir } from "./paths.js";
import { randomUUID } from "node:crypto";

const app = express();

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const host = req.headers.host ?? "";
  const origin = req.headers.origin;
  if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(host) || (origin && !isLocalOrigin(origin))) {
    return res.status(403).json({ error: "local requests only" });
  }
  next();
});
app.use(cors({ origin: (origin, done) => done(null, !origin || isLocalOrigin(origin)) }));
app.use(express.json({ limit: "25mb" }));

const PORT = Number(process.env.PORT ?? 8787);

// Production / Electron: serve the built web app from the same port.
// dev: server/src → ../../web/dist ; bundled: server/dist → ../../web/dist
const WEB_DIST = join(moduleDir, "..", "..", "web", "dist");
if (existsSync(join(WEB_DIST, "index.html"))) {
  app.use(express.static(WEB_DIST));
}

// ---- Meta: providers, defaults, skills -------------------------------------

app.get("/api/meta", (_req, res) => {
  res.json({
    providers: getProvidersMasked().config.providers,
    activeProviderId: getActiveProviderId(),
    defaultBaseUrls: DEFAULT_BASE_URLS,
    skills: listSkills(),
  });
});

app.post("/api/providers", (req, res) => {
  const p = req.body as ProviderConfig;
  if (!p?.id || !p.name || !p.format) return res.status(400).json({ error: "missing fields" });
  try {
    const cfg = upsertProvider(p);
    res.json({ ok: true, activeProviderId: cfg.activeProviderId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete("/api/providers/:id", (req, res) => {
  deleteProvider(req.params.id);
  res.json({ ok: true });
});

app.post("/api/providers/active", (req, res) => {
  const cfg = setActiveProvider(req.body.id);
  res.json({ ok: true, activeProviderId: cfg.activeProviderId });
});

// ---- Projects --------------------------------------------------------------

// ---- Version (update check) ---------------------------------------------------
// The app version lives in the ROOT package.json (electron-builder versions
// releases from it) — injected at bundle time, read from disk in dev.

declare const __APP_VERSION__: string | undefined;

function appVersion(): string {
  if (typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__) return __APP_VERSION__;
  try {
    const root = JSON.parse(readFileSync(join(moduleDir, "..", "..", "package.json"), "utf8"));
    return root.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

app.get("/api/version", (_req, res) => res.json({ version: appVersion() }));

// ---- GitHub codebase fetch (public repos, unauthenticated) ---------------------
// Pulls a design-relevant slice of a public repo (styles, tokens, components)
// to use as codebase context. Size-capped.

app.post("/api/github-repo", async (req, res) => {
  try {
    const { url } = req.body as { url: string };
    const m = String(url ?? "").match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
    if (!m) return res.status(400).json({ error: "无效的 GitHub 仓库 URL" });
    const [, owner, repo] = m;
    const gh = (p: string) =>
      fetch(`https://api.github.com/${p}`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "vibedesign" },
      });
    const repoInfo = await gh(`repos/${owner}/${repo}`).then((r) => (r.ok ? r.json() : null));
    if (!repoInfo) return res.status(404).json({ error: "仓库不可访问（需要公开仓库）" });
    const branch = repoInfo.default_branch ?? "main";
    const tree = await gh(`repos/${owner}/${repo}/git/trees/${branch}?recursive=1`).then((r) =>
      r.ok ? r.json() : null,
    );
    if (!tree?.tree) return res.status(500).json({ error: "无法读取文件树" });

    const interesting = (tree.tree as { path: string; type: string; size?: number }[])
      .filter((f) => f.type === "blob")
      .filter((f) =>
        /(\.css|\.scss|tokens?\.(json|js|ts)|tailwind\.config\.|theme\.|readme\.md|package\.json)/i.test(f.path),
      )
      .filter((f) => (f.size ?? 0) < 60_000)
      .slice(0, 12);

    let total = 0;
    const files: { path: string; content: string }[] = [];
    for (const f of interesting) {
      if (total > 150_000) break;
      const raw = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`,
      ).then((r) => (r.ok ? r.text() : ""));
      if (raw) {
        const content = raw.slice(0, 30_000);
        total += content.length;
        files.push({ path: f.path, content });
      }
    }
    res.json({ repo: `${owner}/${repo}`, branch, files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---- Design systems ----------------------------------------------------------

app.get("/api/design-systems", (_req, res) => res.json(listDesignSystems()));
app.put("/api/design-systems/:id", (req, res) => {
  const ds = req.body as DesignSystem;
  if (!ds?.id || !ds.name) return res.status(400).json({ error: "missing fields" });
  res.json(saveDesignSystem(ds));
});
app.delete("/api/design-systems/:id", (req, res) => {
  deleteDesignSystem(req.params.id);
  res.json({ ok: true });
});

// ---- Live artifacts ----------------------------------------------------------

app.get("/api/live-artifacts", (req, res) => {
  res.json(listLiveArtifacts(typeof req.query.projectId === "string" ? req.query.projectId : undefined));
});

app.get("/api/live-artifacts/:id", (req, res) => {
  const a = getLiveArtifact(req.params.id);
  if (!a) return res.status(404).json({ error: "not found" });
  res.json(a);
});

app.post("/api/live-artifacts", (req, res) => {
  const b = req.body as Partial<LiveArtifact>;
  if (!b?.projectId || !b.templateHtml) return res.status(400).json({ error: "projectId and templateHtml required" });
  const now = Date.now();
  const a: LiveArtifact = {
    id: b.id || `live_${randomUUID().slice(0, 8)}`,
    projectId: b.projectId,
    title: b.title || "Live artifact",
    templateHtml: b.templateHtml,
    dataJson: b.dataJson ?? {},
    source: b.source,
    refreshStatus: "idle",
    createdAt: now,
    updatedAt: now,
  };
  try {
    assertBoundedJson(a.dataJson, "initial data"); // cap shape/size + reject credential keys
    if (a.source?.type === "http_json") assertSafeHttpUrl(a.source.url); // fail fast on unsafe URL
    renderLiveHtml(a.templateHtml, a.dataJson); // validate before persisting
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
  const saved = saveLiveArtifact(a);
  initLiveArtifactAudit(saved); // baseline snapshot + 'created' audit entry
  res.json(saved);
});

// Curated read-only connectors + sandboxed local JSON drop-sources (for the UI).
app.get("/api/connectors", (_req, res) => res.json(listConnectors()));
app.get("/api/live-sources", (_req, res) => res.json(listLocalSources()));

app.get("/api/live-artifacts/:id/refreshes", (req, res) => {
  if (!getLiveArtifact(req.params.id)) return res.status(404).json({ error: "not found" });
  res.json(readRefreshLog(req.params.id));
});

app.post("/api/live-artifacts/:id/rollback", (req, res) => {
  try {
    const refreshId = String(req.body?.refreshId ?? "");
    if (!refreshId) return res.status(400).json({ error: "refreshId required" });
    res.json(rollbackLiveArtifact(req.params.id, refreshId));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/live-artifacts/:id/preview", (req, res) => {
  const a = getLiveArtifact(req.params.id);
  if (!a) return res.status(404).send("not found");
  try {
    const html = renderLiveHtml(a.templateHtml, a.dataJson);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; base-uri 'none'; form-action 'none'",
    );
    res.send(html);
  } catch (err) {
    res.status(500).send(String(err instanceof Error ? err.message : err));
  }
});

app.post("/api/live-artifacts/:id/refresh", async (req, res) => {
  try {
    const pid = (req.body?.providerId as string) || getActiveProviderId();
    const provider = pid ? getProvider(pid) : undefined;
    const a = await refreshLiveArtifact(req.params.id, provider);
    res.json(a);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete("/api/live-artifacts/:id", (req, res) => {
  deleteLiveArtifact(req.params.id);
  res.json({ ok: true });
});

// ---- Motion video render (HyperFrames advanced) ------------------------------
// Headless Chromium seeks the artifact's animation timeline frame-by-frame,
// ffmpeg encodes the frames to MP4/WebM. Slow (seconds); returns the bytes.

const MAX_RENDER_HTML_BYTES = 5 * 1024 * 1024;
const MAX_CONCURRENT_RENDERS = 2;
let activeRenders = 0;

async function runBoundedRender<T>(
  res: express.Response,
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (activeRenders >= MAX_CONCURRENT_RENDERS) throw Object.assign(new Error("render capacity reached"), { status: 429 });
  activeRenders += 1;
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort(new Error(`render timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  const onClose = () => {
    if (!res.writableEnded) ac.abort(new Error("client disconnected"));
  };
  res.once("close", onClose);
  try {
    return await task(ac.signal);
  } catch (err) {
    if (timedOut) throw Object.assign(new Error(`render timed out after ${timeoutMs}ms`), { status: 504 });
    throw err;
  } finally {
    clearTimeout(timer);
    res.off("close", onClose);
    activeRenders -= 1;
  }
}

function renderError(res: express.Response, err: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 500;
  res.status(Number.isInteger(status) ? status : 500).json({ error: err instanceof Error ? err.message : String(err) });
}

app.post("/api/render-motion", async (req, res) => {
  const { html, ...opts } = req.body as { html?: string } & MotionRenderOpts;
  if (!html || typeof html !== "string") return res.status(400).json({ error: "html required" });
  if (Buffer.byteLength(html, "utf8") > MAX_RENDER_HTML_BYTES) return res.status(413).json({ error: "html too large" });
  try {
    const { buffer, mime, ext } = await runBoundedRender(res, 120_000, (signal) => renderMotionVideo(html, opts, signal));
    if (res.destroyed || res.writableEnded) return;
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="motion.${ext}"`);
    res.send(buffer);
  } catch (err) {
    renderError(res, err);
  }
});

// Pixel-perfect PNG / PDF via headless Chromium (real fonts, WebGL, CJK).
app.post("/api/render-screenshot", async (req, res) => {
  const { html, ...opts } = req.body as { html?: string } & ShotOpts;
  if (!html || typeof html !== "string") return res.status(400).json({ error: "html required" });
  if (Buffer.byteLength(html, "utf8") > MAX_RENDER_HTML_BYTES) return res.status(413).json({ error: "html too large" });
  try {
    const { buffer, mime, ext } = await runBoundedRender(res, 45_000, (signal) => renderScreenshot(html, opts, signal));
    if (res.destroyed || res.writableEnded) return;
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="design.${ext}"`);
    res.send(buffer);
  } catch (err) {
    renderError(res, err);
  }
});

// Shared deck runtime assets (open-design html-ppt: base.css / runtime.js /
// themes / animations). Decks link these by stable /api/deck-assets/ URLs.
app.get("/api/deck-assets/*", (req, res) => {
  const served = serveDeckAsset((req.params as Record<string, string>)[0] ?? "");
  if (!served) return res.status(404).send("not found");
  res.setHeader("Content-Type", served.contentType);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(served.buffer);
});

// Multi-file artifact serving: entry HTML + sibling files (styles.css / app.js).
// Relative refs in the entry resolve against the trailing-slash base URL.
app.get("/api/mf/:projectId/:versionId/*", (req, res) => {
  const served = serveMultiFile(req.params.projectId, req.params.versionId, (req.params as Record<string, string>)[0] ?? "");
  if (!served) return res.status(404).send("not found");
  res.setHeader("Content-Type", served.contentType);
  res.setHeader("Cache-Control", "no-store");
  res.send(served.body);
});

app.get("/api/projects", (_req, res) => res.json(listProjects()));
app.get("/api/projects/:id", (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json(p);
});
app.put("/api/projects/:id", (req, res) => res.json(saveProject(req.body)));
app.delete("/api/projects/:id", (req, res) => {
  deleteProject(req.params.id);
  res.json({ ok: true });
});

// ---- Chat (SSE streaming) --------------------------------------------------

app.post("/api/chat", async (req, res) => {
  const {
    messages,
    providerId,
    skillId,
    designSystemId,
    extraInstruction,
    lang,
  }: {
    messages: ChatMessage[];
    providerId?: string;
    skillId?: string;
    designSystemId?: string;
    extraInstruction?: string;
    lang?: string;
  } = req.body;

  const pid = providerId || getActiveProviderId();
  const provider = pid ? getProvider(pid) : undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  if (!provider) {
    send({ type: "error", error: "尚未配置模型服务。请在设置里添加一个 Provider。" });
    send({ type: "done" });
    return res.end();
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    send({ type: "error", error: "messages required" });
    send({ type: "done" });
    return res.end();
  }

  const ac = new AbortController();
  // GOTCHA: req 的 "close" 在新版 Node 里于请求体读完后即触发（并非客户端断开），
  // 会立刻 abort 掉上游 fetch。改听 res 的 close，且仅在响应未正常结束时视为断开。
  res.on("close", () => {
    if (!res.writableEnded) ac.abort();
  });

  const ds = designSystemId ? getDesignSystem(designSystemId, lang) : undefined;
  let system = buildSystem(skillId, ds);
  if (extraInstruction) system += `\n\n---\n\n# Active mode\n\n${extraInstruction}`;
  const streamFn = getStreamFn(provider.format);

  try {
    for await (const evt of streamFn({ system, messages, config: provider, signal: ac.signal })) {
      if (evt.type === "done") break; // finally 统一发 done，避免重复
      send(evt);
      if (evt.type === "error") break;
    }
  } catch (err: unknown) {
    if (!ac.signal.aborted) {
      send({ type: "error", error: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    send({ type: "done" });
    res.end();
  }
});

app.listen(PORT, "127.0.0.1", () => {
  const n = getProviders().length;
  const recovered = recoverStaleLiveRefreshes(); // clear locks/statuses from a crashed run
  console.log(
    `[vibedesign] server on http://127.0.0.1:${PORT}  (${n} provider${n === 1 ? "" : "s"} configured` +
      (recovered ? `, recovered ${recovered} stale refresh${recovered === 1 ? "" : "es"}` : "") +
      `)`,
  );
});
