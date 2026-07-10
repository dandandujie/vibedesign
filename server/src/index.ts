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

// ---- Version (update check) ---------------------------------------------------

const APP_VERSION = process.env.npm_package_version ?? "0.1.0";
app.get("/api/version", (_req, res) => res.json({ version: APP_VERSION }));

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
  }: {
    messages: ChatMessage[];
    providerId?: string;
    skillId?: string;
    designSystemId?: string;
    extraInstruction?: string;
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

  const ds = designSystemId ? getDesignSystem(designSystemId) : undefined;
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

app.listen(PORT, () => {
  const n = getProviders().length;
  console.log(`[vibedesign] server on http://localhost:${PORT}  (${n} provider${n === 1 ? "" : "s"} configured)`);
});
