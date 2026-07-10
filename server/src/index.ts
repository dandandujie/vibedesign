import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
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
import { moduleDir } from "./paths.js";

const app = express();
app.use(cors());
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
  const cfg = upsertProvider(p);
  res.json({ ok: true, activeProviderId: cfg.activeProviderId });
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
  }: { messages: ChatMessage[]; providerId?: string; skillId?: string; designSystemId?: string } =
    req.body;

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

  const ds = designSystemId ? getDesignSystem(designSystemId) : undefined;
  const system = buildSystem(skillId, ds);
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

app.listen(PORT, () => {
  const n = getProviders().length;
  console.log(`[vibedesign] server on http://localhost:${PORT}  (${n} provider${n === 1 ? "" : "s"} configured)`);
});
