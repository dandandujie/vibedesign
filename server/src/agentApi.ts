// Agent-facing API: lets local coding agents (Claude Code, Codex CLI, Cursor,
// Pi agent — via the vibedesign MCP server or plain HTTP) drive generation
// headlessly. The web editor owns extraction/versioning for interactive chats;
// these endpoints do the same server-side so an agent can go prompt → stored
// artifact version → editor/preview URL in one call.

import { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { getStreamFn, ChatMessage, ProviderConfig, StreamEvent } from "./providers/index.js";
import { buildSystem } from "./brain.js";
import { getDesignSystem, getProject, saveProject, ArtifactVersion, Project } from "./storage.js";
import { extractDeliverable, extractFiles, extractSite, stripArtifact } from "../../shared/extract.js";

// ---- Shared completion pipeline ----------------------------------------------
// One place that assembles the system prompt (brain + design system + active
// mode) and runs the provider stream to completion. /api/chat uses it with an
// onEvent callback wired to SSE; the agent endpoint collects the full text.

export interface CompletionInput {
  messages: ChatMessage[];
  provider: ProviderConfig;
  skillId?: string;
  designSystemId?: string;
  extraInstruction?: string;
  lang?: string;
  signal: AbortSignal;
  onEvent?: (evt: StreamEvent) => void;
}

export async function runCompletion(input: CompletionInput): Promise<{ text: string; error?: string }> {
  const ds = input.designSystemId ? getDesignSystem(input.designSystemId, input.lang) : undefined;
  let system = buildSystem(input.skillId, ds);
  if (input.extraInstruction) system += `\n\n---\n\n# Active mode\n\n${input.extraInstruction}`;
  const streamFn = getStreamFn(input.provider.format);
  let text = "";
  let error: string | undefined;
  try {
    for await (const evt of streamFn({ system, messages: input.messages, config: input.provider, signal: input.signal })) {
      if (evt.type === "done") break;
      if (evt.type === "text") text += evt.text;
      if (evt.type === "error") {
        error = evt.error;
        input.onEvent?.(evt);
        break;
      }
      input.onEvent?.(evt);
    }
  } catch (err: unknown) {
    if (!input.signal.aborted) error = err instanceof Error ? err.message : String(err);
  }
  return { text, error };
}

// ---- Artifact extraction → version -------------------------------------------

function titleFrom(text: string, fallback: string): string {
  return text.match(/^####\s+(.+)$/m)?.[1]?.trim().slice(0, 40) ?? fallback;
}

// Turn a completed assistant reply into an ArtifactVersion (or null when the
// reply carries no deliverable — e.g. a clarifying-question form).
export function versionFromReply(fullText: string, prompt: string): ArtifactVersion | null {
  const base = {
    id: randomUUID(),
    createdAt: Date.now(),
    source: "ai" as const,
    prompt: prompt.slice(0, 60),
  };
  // Site / flow prototype (multi-page) — checked before plain vdfiles.
  const site = extractSite(fullText);
  if (site) {
    return {
      ...base,
      kind: "multifile",
      label: titleFrom(fullText, "站点原型"),
      html: site.files[site.entry] ?? "",
      entry: site.entry,
      files: site.files,
      ...(site.site ? { site: site.site } : {}),
    };
  }
  const mf = extractFiles(fullText);
  if (mf) {
    return {
      ...base,
      kind: "multifile",
      label: titleFrom(fullText, "多文件设计"),
      html: mf.files[mf.entry] ?? "",
      entry: mf.entry,
      files: mf.files,
    };
  }
  const d = extractDeliverable(fullText);
  if (d) {
    return { ...base, kind: d.kind, label: d.title, html: d.html };
  }
  return null;
}

// ---- Routes -------------------------------------------------------------------

export interface AgentApiDeps {
  resolveProvider: (providerId?: string) => ProviderConfig | undefined;
}

export function mountAgentApi(app: Express, deps: AgentApiDeps) {
  // Generate (or iterate on) a design headlessly. Blocking JSON response —
  // generation typically takes 1–5 minutes; callers (the MCP server) report
  // progress locally while waiting.
  app.post("/api/agent/design", async (req: Request, res: Response) => {
    const {
      prompt,
      projectId,
      projectName,
      providerId,
      skillId,
      designSystemId,
      extraInstruction,
      lang,
    }: {
      prompt?: string;
      projectId?: string;
      projectName?: string;
      providerId?: string;
      skillId?: string;
      designSystemId?: string;
      extraInstruction?: string;
      lang?: string;
    } = req.body ?? {};

    if (!prompt || !prompt.trim()) return res.status(400).json({ error: "prompt required" });
    const provider = deps.resolveProvider(providerId);
    if (!provider) return res.status(400).json({ error: "no model provider configured — add one in Vibedesign settings first" });

    let project: Project | undefined;
    if (projectId) {
      project = getProject(projectId);
      if (!project) return res.status(404).json({ error: `project not found: ${projectId}` });
    } else {
      project = {
        id: randomUUID(),
        name: (projectName || prompt).trim().slice(0, 40) || "Agent design",
        messages: [],
        artifacts: [],
        sessionStartedAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    const userMsg: ChatMessage = { role: "user", content: prompt };
    const messages = [...project.messages, userMsg];

    const ac = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });

    const { text, error } = await runCompletion({
      messages,
      provider,
      skillId,
      designSystemId,
      extraInstruction,
      lang,
      signal: ac.signal,
    });
    if (error) return res.status(502).json({ error, projectId: project.id });
    if (ac.signal.aborted) return; // client went away mid-generation

    const version = versionFromReply(text, prompt);
    project.messages = [...messages, { role: "assistant", content: text }];
    if (version) {
      project.artifacts = [...project.artifacts, version];
      // Client-side field (the web editor passes unknown fields through) — set
      // it here too so opening the editor lands on the freshly generated version.
      (project as Project & { activeVersionId?: string }).activeVersionId = version.id;
    }
    saveProject(project);

    const base = `${req.protocol}://${req.get("host")}`;
    res.json({
      projectId: project.id,
      name: project.name,
      versionId: version?.id ?? null,
      kind: version?.kind ?? null,
      label: version?.label ?? null,
      editorUrl: `${base}/#/p/${project.id}`,
      ...(version?.kind === "multifile" && version.entry
        ? { previewUrl: `${base}/api/mf/${project.id}/${version.id}/${version.entry}` }
        : {}),
      pages: version?.site?.pages ?? undefined,
      text: stripArtifact(text).slice(0, 2000),
    });
  });

  // Read back the current (or a specific) artifact of a project, so an agent
  // can pull the generated design into a codebase.
  app.get("/api/agent/projects/:id/artifact", (req: Request, res: Response) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "not found" });
    const wanted = typeof req.query.versionId === "string" ? req.query.versionId : undefined;
    const activeId = (project as Project & { activeVersionId?: string }).activeVersionId;
    const version =
      (wanted && project.artifacts.find((a) => a.id === wanted)) ||
      (activeId && project.artifacts.find((a) => a.id === activeId)) ||
      project.artifacts[project.artifacts.length - 1];
    if (!version) return res.status(404).json({ error: "project has no artifact versions yet" });
    res.json({
      projectId: project.id,
      name: project.name,
      versionId: version.id,
      kind: version.kind ?? "html",
      label: version.label,
      createdAt: version.createdAt,
      ...(version.kind === "multifile"
        ? { entry: version.entry, files: version.files, site: version.site }
        : { html: version.html }),
      versions: project.artifacts.map((a) => ({ id: a.id, label: a.label, createdAt: a.createdAt, kind: a.kind ?? "html" })),
    });
  });
}
