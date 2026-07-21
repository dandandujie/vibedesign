// Vibedesign MCP server (stdio) — lets local coding agents (Claude Code, Codex
// CLI, Cursor, …) drive Vibedesign: generate/iterate designs headlessly and
// pull artifacts back into the codebase. It is a thin client of the local
// Vibedesign HTTP API (see agentApi.ts), so the desktop app or dev server must
// be running.
//
// Usage: node dist/mcp.cjs   (dev: npx tsx src/mcp.ts)
// Env:   VD_BASE_URL — override the API base (default: probe 127.0.0.1:8788
//        desktop, then :8787 dev).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_PORTS = [8788, 8787]; // desktop (Electron) first, then dev server

let cachedBase: string | null = null;

async function probe(base: string): Promise<boolean> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);
    const res = await fetch(`${base}/api/version`, { signal: ac.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveBase(): Promise<string> {
  if (process.env.VD_BASE_URL) return process.env.VD_BASE_URL.replace(/\/+$/, "");
  if (cachedBase) return cachedBase;
  for (const port of DEFAULT_PORTS) {
    const base = `http://127.0.0.1:${port}`;
    if (await probe(base)) {
      cachedBase = base;
      return base;
    }
  }
  throw new Error(
    `Vibedesign is not running (probed ${DEFAULT_PORTS.map((p) => `127.0.0.1:${p}`).join(", ")}). ` +
      `Start the Vibedesign desktop app or the dev server (npm run dev) first.`,
  );
}

// One retry with a fresh base-URL probe: the app may have restarted on the
// other port since the first probe.
async function api(path: string, init?: RequestInit): Promise<unknown> {
  let base = await resolveBase();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      return body;
    } catch (err) {
      if (attempt === 0 && err instanceof Error && /fetch failed|ECONNREFUSED|network/i.test(err.message)) {
        cachedBase = null;
        base = await resolveBase();
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

function asText(data: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function asError(err: unknown): { content: { type: "text"; text: string }[]; isError: true } {
  return { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true };
}

const server = new McpServer({ name: "vibedesign", version: "0.5.0" });

server.registerTool(
  "vd_design",
  {
    title: "Generate / iterate a design in Vibedesign",
    description:
      "Send a design brief to Vibedesign (a local Claude Design workbench) and get back a rendered artifact: " +
      "single-page HTML prototypes, multi-page site prototypes, decks, docs. Pass projectId to iterate on an " +
      "existing project; omit it to create a new one. Generation takes 1–5 minutes. Always show the returned " +
      "editorUrl to the user so they can watch/refine in the Vibedesign canvas. Use skillId (see vd_list_skills) " +
      "for specialized output, e.g. 'site-prototype' for multi-page prototypes, 'make-a-deck' for slides.",
    inputSchema: {
      prompt: z.string().describe("The design brief or iteration instruction, in the user's language"),
      projectId: z.string().optional().describe("Existing project id to iterate on; omit to create a new project"),
      projectName: z.string().optional().describe("Name for the new project (defaults to the prompt)"),
      skillId: z.string().optional().describe("Skill to activate for this generation (see vd_list_skills)"),
      designSystemId: z.string().optional().describe("Design system to apply (see vd_list_design_systems)"),
      lang: z.string().optional().describe("UI/content language hint, e.g. 'zh' or 'en'"),
    },
  },
  async (args, extra) => {
    const started = Date.now();
    // Long generation: keep the client informed so it does not time out.
    const progressToken = (extra as { _meta?: { progressToken?: string | number } })._meta?.progressToken;
    const timer = setInterval(() => {
      if (progressToken === undefined) return;
      const elapsed = Math.round((Date.now() - started) / 1000);
      extra
        .sendNotification({
          method: "notifications/progress",
          params: { progressToken, progress: elapsed, message: `Vibedesign generating… ${elapsed}s` },
        })
        .catch(() => {});
    }, 15_000);
    try {
      const result = (await api("/api/agent/design", { method: "POST", body: JSON.stringify(args) })) as Record<string, unknown>;
      return asText({
        ...result,
        hint: "Design ready. Share editorUrl with the user; call vd_design again with this projectId to iterate, or vd_get_artifact to pull the source into the codebase.",
      });
    } catch (err) {
      return asError(err);
    } finally {
      clearInterval(timer);
    }
  },
);

server.registerTool(
  "vd_list_projects",
  {
    title: "List Vibedesign projects",
    description: "List existing Vibedesign projects (id, name, updatedAt) so you can pick one to iterate on with vd_design.",
    inputSchema: {},
  },
  async () => {
    try {
      return asText(await api("/api/projects"));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  "vd_get_artifact",
  {
    title: "Get a project's design source",
    description:
      "Fetch the current (or a specific) artifact version of a Vibedesign project: self-contained HTML, or entry + " +
      "files for multi-file/site prototypes. Large artifacts are truncated; fetch individual files of a multi-file " +
      "artifact via GET {base}/api/mf/{projectId}/{versionId}/{path}.",
    inputSchema: {
      projectId: z.string(),
      versionId: z.string().optional(),
      maxBytes: z.number().optional().describe("Truncate HTML/files payload beyond this size (default 100000)"),
    },
  },
  async ({ projectId, versionId, maxBytes }) => {
    try {
      const limit = maxBytes ?? 100_000;
      const data = (await api(`/api/agent/projects/${encodeURIComponent(projectId)}/artifact${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""}`)) as Record<string, unknown>;
      if (typeof data.html === "string" && data.html.length > limit) {
        data.html = data.html.slice(0, limit) + `\n<!-- truncated at ${limit} bytes -->`;
        data.truncated = true;
      }
      if (data.files && typeof data.files === "object") {
        const files = data.files as Record<string, string>;
        let total = 0;
        const kept: Record<string, string> = {};
        const dropped: string[] = [];
        for (const [path, content] of Object.entries(files)) {
          if (total + content.length <= limit) {
            kept[path] = content;
            total += content.length;
          } else dropped.push(path);
        }
        if (dropped.length) {
          data.files = kept;
          data.droppedFiles = dropped;
          data.note = `Dropped ${dropped.length} file(s) over the size budget; fetch them via /api/mf/${projectId}/${data.versionId}/<path>`;
        }
      }
      return asText(data);
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  "vd_list_skills",
  {
    title: "List Vibedesign skills",
    description: "List generation skills (templates, review passes, decks…) usable as vd_design's skillId.",
    inputSchema: {},
  },
  async () => {
    try {
      const meta = (await api("/api/meta")) as { skills?: { id: string; title: string }[] };
      return asText(meta.skills ?? []);
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  "vd_list_design_systems",
  {
    title: "List Vibedesign design systems",
    description: "List design systems (brand contexts) usable as vd_design's designSystemId.",
    inputSchema: {},
  },
  async () => {
    try {
      const list = (await api("/api/design-systems")) as { id: string; name: string; category?: string }[];
      return asText(list.map(({ id, name, category }) => ({ id, name, category })));
    } catch (err) {
      return asError(err);
    }
  },
);

const transport = new StdioServerTransport();
// eslint-disable-next-line no-void
void (async () => {
  await server.connect(transport);
  console.error("[vibedesign-mcp] stdio server ready");
})().catch((err) => {
  console.error("[vibedesign-mcp] fatal:", err);
  process.exit(1);
});
