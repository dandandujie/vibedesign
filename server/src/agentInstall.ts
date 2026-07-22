// Agent integration registry: status / install / uninstall for the 11 supported
// coding agents. Shared by the HTTP API (Settings → Agent 打通 panel) — the
// standalone CLI (integrations/install.mjs) mirrors the same matrix.
//
// Launch spec: how agents spawn the Vibedesign MCP stdio server.
//   - Desktop (Electron): the app binary itself with `--vd-mcp` (main.cjs
//     detects the flag and runs the bundled MCP server — works from asar).
//   - Dev / node: `node server/dist/mcp.cjs`.
//   - Override: VD_MCP_ENTRY=<path to mcp.cjs> forces the node spec.

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { moduleDir } from "./paths.js";

const HOME = process.env.VD_AGENT_HOME || homedir();

// ---- launch spec ---------------------------------------------------------------

export interface LaunchSpec {
  command: string;
  args: string[];
}

export function resolveLaunch(): { spec?: LaunchSpec; error?: string } {
  const override = process.env.VD_MCP_ENTRY;
  if (override) {
    return existsSync(override)
      ? { spec: { command: "node", args: [override] } }
      : { error: `VD_MCP_ENTRY 指向的文件不存在: ${override}` };
  }
  if (process.versions.electron) {
    // main.cjs handles --vd-mcp by running the bundled MCP server.
    return { spec: { command: process.execPath, args: ["--vd-mcp"] } };
  }
  const candidates = [join(moduleDir, "mcp.cjs"), join(moduleDir, "..", "dist", "mcp.cjs")];
  const entry = candidates.find((p) => existsSync(p));
  return entry
    ? { spec: { command: "node", args: [entry] } }
    : { error: "server/dist/mcp.cjs 不存在，请先构建（npm run build）" };
}

// ---- agent registry --------------------------------------------------------------

type McpFile =
  | { kind: "json"; file: string; topKey: string; special?: "opencode" }
  | { kind: "toml"; file: string }
  | { kind: "yaml"; file: string };

interface AgentSpec {
  slug: string;
  name: string;
  cli?: { bin: string; args: (launch: LaunchSpec) => string[] };
  mcp?: McpFile;
  skillDir?: string; // directory that receives SKILL.md
  commandFile?: string; // markdown command file (lighter-weight convention)
  note?: string;
}

const SKILL_SRC = join(moduleDir, "..", "..", "integrations", "design", "SKILL.md");
const SKILL_SRC_ALT = join(moduleDir, "..", "integrations", "design", "SKILL.md");

function skillSource(): string | null {
  if (existsSync(SKILL_SRC)) return SKILL_SRC;
  if (existsSync(SKILL_SRC_ALT)) return SKILL_SRC_ALT;
  return null;
}

const COMMAND_MD = `---
description: Design with Vibedesign
---

Design the user's request with Vibedesign, the local design workbench on this machine.

1. If the \`vibedesign\` MCP server is configured in this agent (\`vd_design\` and
   related tools), use those tools — they handle everything for you.
2. Otherwise call the local HTTP API:
   - Base URL: \`http://127.0.0.1:8788\` (desktop app), fall back to
     \`http://127.0.0.1:8787\` (dev server).
   - \`POST /api/agent/design\` with JSON body
     \`{"prompt": "<the brief>", "projectId"?: "...", "skillId"?: "..."}\`.
     Omit \`projectId\` to create a new project; pass it to iterate on an existing one.
   - Generation blocks for 1–5 minutes.
3. Always show the \`editorUrl\` from the response — the user can watch generation
   live and refine the design on canvas.
4. Iterate by POSTing again with the returned \`projectId\` and a short follow-up.

If neither port answers, tell the user to start Vibedesign first.
`;

function traeMcpFile(): string {
  if (process.platform === "darwin") return join(HOME, "Library", "Application Support", "Trae", "User", "mcp.json");
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(HOME, "AppData", "Roaming"), "Trae", "User", "mcp.json");
  return join(HOME, ".config", "Trae", "User", "mcp.json");
}

const AGENTS: AgentSpec[] = [
  {
    slug: "claude",
    name: "Claude Code",
    cli: { bin: "claude", args: (l) => ["mcp", "add", "--scope", "user", "vibedesign", "--", l.command, ...l.args] },
    mcp: { kind: "json", file: join(HOME, ".claude.json"), topKey: "mcpServers" },
    skillDir: join(HOME, ".claude", "skills", "design"),
  },
  {
    slug: "codex",
    name: "Codex CLI",
    cli: { bin: "codex", args: (l) => ["mcp", "add", "vibedesign", "--", l.command, ...l.args] },
    mcp: { kind: "toml", file: join(HOME, ".codex", "config.toml") },
    skillDir: join(HOME, ".codex", "skills", "design"),
  },
  {
    slug: "cursor",
    name: "Cursor",
    mcp: { kind: "json", file: join(HOME, ".cursor", "mcp.json"), topKey: "mcpServers" },
  },
  {
    slug: "opencode",
    name: "OpenCode",
    mcp: { kind: "json", file: join(HOME, ".config", "opencode", "opencode.json"), topKey: "mcp", special: "opencode" },
    commandFile: join(HOME, ".config", "opencode", "commands", "design.md"),
  },
  {
    slug: "pi",
    name: "Pi agent",
    skillDir: join(HOME, ".pi", "agent", "skills", "design"),
    commandFile: join(HOME, ".pi", "agent", "prompts", "design.md"),
    note: "Pi 无原生 MCP，勾选后将安装 /design 技能（HTTP 直连流程）",
  },
  {
    slug: "hermes",
    name: "Hermes",
    cli: { bin: "hermes", args: (l) => ["mcp", "add", "vibedesign", "--command", l.command, "--args", l.args.join(" ")] },
    mcp: { kind: "yaml", file: join(HOME, ".hermes", "config.yaml") },
  },
  {
    slug: "grok",
    name: "Grok Build",
    cli: { bin: "grok", args: (l) => ["mcp", "add", "vibedesign", "--", l.command, ...l.args] },
    mcp: { kind: "toml", file: join(HOME, ".grok", "config.toml") },
    skillDir: join(HOME, ".grok", "skills", "design"),
  },
  {
    slug: "antigravity",
    name: "Antigravity",
    mcp: { kind: "json", file: join(HOME, ".gemini", "antigravity", "mcp_config.json"), topKey: "mcpServers" },
    skillDir: join(HOME, ".gemini", "config", "skills", "design"),
  },
  {
    slug: "kimi",
    name: "Kimi Code CLI",
    mcp: { kind: "json", file: join(HOME, ".kimi-code", "mcp.json"), topKey: "mcpServers" },
    skillDir: join(HOME, ".kimi-code", "skills", "design"),
  },
  {
    slug: "qoder",
    name: "Qoder CLI",
    cli: { bin: "qodercli", args: (l) => ["mcp", "add", "vibedesign", "--", l.command, ...l.args] },
    mcp: { kind: "json", file: join(HOME, ".qoder.json"), topKey: "mcpServers" },
    commandFile: join(HOME, ".qoder", "commands", "design.md"),
  },
  {
    slug: "trae",
    name: "Trae",
    mcp: { kind: "json", file: traeMcpFile(), topKey: "mcpServers" },
    note: "Trae 也可在 IDE 图形界面管理：Settings → MCP",
  },
];

// ---- helpers ---------------------------------------------------------------------

function backup(path: string) {
  if (existsSync(path)) copyFileSync(path, path + ".bak");
}

function hasCli(bin: string): boolean {
  const r = spawnSync(bin, ["--version"], { stdio: "ignore" });
  return r.status === 0;
}

function mcpEntry(launch: LaunchSpec, special?: "opencode") {
  if (special === "opencode") return { type: "local", command: [launch.command, ...launch.args], enabled: true };
  return { command: launch.command, args: launch.args };
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// ---- status ---------------------------------------------------------------------

export interface AgentStatus {
  slug: string;
  name: string;
  cliDetected: boolean;
  mcpConfigured: boolean;
  skillInstalled: boolean;
  supportsSkill: boolean;
  note?: string;
}

function detectMcp(mcp: McpFile): boolean {
  if (!existsSync(mcp.file)) return false;
  if (mcp.kind === "json") {
    const data = readJson(mcp.file);
    if (!data) return false;
    const top = data[mcp.topKey] as Record<string, unknown> | undefined;
    if (top && "vibedesign" in top) return true;
    // claude CLI may register project-scoped: projects.*.mcpServers
    const projects = data.projects as Record<string, { mcpServers?: Record<string, unknown> }> | undefined;
    if (projects) return Object.values(projects).some((p) => p?.mcpServers && "vibedesign" in p.mcpServers);
    return false;
  }
  const text = readFileSync(mcp.file, "utf8");
  if (mcp.kind === "toml") return /^\s*\[mcp_servers\.vibedesign\]\s*$/m.test(text);
  return /^mcp_servers\s*:[\s\S]*?^\s{2}vibedesign\s*:/m.test(text);
}

function detectSkill(a: AgentSpec): boolean {
  if (a.skillDir && existsSync(join(a.skillDir, "SKILL.md"))) return true;
  if (a.commandFile && existsSync(a.commandFile)) return true;
  return false;
}

export function listAgentStatus(): AgentStatus[] {
  return AGENTS.map((a) => ({
    slug: a.slug,
    name: a.name,
    cliDetected: a.cli ? hasCli(a.cli.bin) : false,
    mcpConfigured: a.mcp ? detectMcp(a.mcp) : false,
    skillInstalled: detectSkill(a),
    supportsSkill: !!(a.skillDir || a.commandFile),
    ...(a.note ? { note: a.note } : {}),
  }));
}

// ---- install / uninstall ---------------------------------------------------------

function writeJsonEntry(file: string, topKey: string, value: unknown): void {
  let data: Record<string, unknown> = {};
  if (existsSync(file)) {
    const parsed = readJson(file);
    if (!parsed) throw new Error(`${file} 不是合法 JSON，已拒绝写入（请手动修复）`);
    data = parsed;
  }
  backup(file);
  data[topKey] = { ...((data[topKey] as Record<string, unknown>) ?? {}), vibedesign: value };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function removeJsonEntry(file: string, topKey: string): void {
  if (!existsSync(file)) return;
  const data = readJson(file);
  if (!data) throw new Error(`${file} 不是合法 JSON，未改动`);
  const top = data[topKey] as Record<string, unknown> | undefined;
  if (top && "vibedesign" in top) {
    backup(file);
    delete top.vibedesign;
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  }
}

function tomlWithout(text: string): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of text.split("\n")) {
    if (/^\s*\[/.test(line)) skipping = /^\s*\[mcp_servers\.vibedesign\]\s*$/.test(line);
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").trimEnd();
}

function writeTomlEntry(file: string, launch: LaunchSpec): void {
  const text = existsSync(file) ? tomlWithout(readFileSync(file, "utf8")) : "";
  const esc = (s: string) => s.replace(/\\/g, "\\\\");
  const block =
    `[mcp_servers.vibedesign]\ncommand = "${esc(launch.command)}"\nargs = [${launch.args.map((a) => `"${esc(a)}"`).join(", ")}]\n`;
  backup(file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, (text ? text + "\n\n" : "") + block);
}

function yamlEntryLines(launch: LaunchSpec): string[] {
  return ["  vibedesign:", `    command: ${launch.command}`, `    args: [${launch.args.map((a) => `"${a}"`).join(", ")}]`];
}

function yamlWithout(lines: string[]): string[] {
  const kept: string[] = [];
  let inMcp = false;
  let skipBelow = -1;
  for (const line of lines) {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    if (skipBelow >= 0) {
      if (trimmed === "" || indent > skipBelow) continue;
      skipBelow = -1;
    }
    if (trimmed !== "" && indent === 0) inMcp = /^mcp_servers\s*:/.test(trimmed);
    if (inMcp && indent === 2 && /^vibedesign\s*:/.test(trimmed)) {
      skipBelow = 2;
      continue;
    }
    kept.push(line);
  }
  return kept;
}

function writeYamlEntry(file: string, launch: LaunchSpec): void {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
  const kept = yamlWithout(lines);
  const idx = kept.findIndex((l) => /^mcp_servers\s*:/.test(l));
  let text: string;
  if (idx === -1) {
    text = (kept.join("\n").trimEnd() ? kept.join("\n").trimEnd() + "\n\n" : "") + ["mcp_servers:", ...yamlEntryLines(launch)].join("\n") + "\n";
  } else {
    kept.splice(idx + 1, 0, ...yamlEntryLines(launch));
    text = kept.join("\n").trimEnd() + "\n";
  }
  backup(file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function writeMcpFile(mcp: McpFile, launch: LaunchSpec): void {
  if (mcp.kind === "json") writeJsonEntry(mcp.file, mcp.topKey, mcpEntry(launch, mcp.special));
  else if (mcp.kind === "toml") writeTomlEntry(mcp.file, launch);
  else writeYamlEntry(mcp.file, launch);
}

function removeMcpFile(mcp: McpFile): void {
  if (!existsSync(mcp.file)) return;
  if (mcp.kind === "json") removeJsonEntry(mcp.file, mcp.topKey);
  else if (mcp.kind === "toml") {
    backup(mcp.file);
    writeFileSync(mcp.file, tomlWithout(readFileSync(mcp.file, "utf8")) + "\n");
  } else {
    backup(mcp.file);
    writeFileSync(mcp.file, yamlWithout(readFileSync(mcp.file, "utf8").split("\n")).join("\n").trimEnd() + "\n");
  }
}

function installSkillFiles(a: AgentSpec, log: string[]): void {
  const src = skillSource();
  if (a.skillDir) {
    if (!src) throw new Error("integrations/design/SKILL.md 不存在（打包缺失？）");
    mkdirSync(a.skillDir, { recursive: true });
    copyFileSync(src, join(a.skillDir, "SKILL.md"));
    log.push(`skill → ${a.skillDir}/SKILL.md`);
  }
  if (a.commandFile) {
    backup(a.commandFile);
    mkdirSync(dirname(a.commandFile), { recursive: true });
    writeFileSync(a.commandFile, COMMAND_MD);
    log.push(`command → ${a.commandFile}`);
  }
}

export function installAgent(slug: string): { ok: boolean; log: string[]; skipped: string[]; error?: string } {
  const a = AGENTS.find((x) => x.slug === slug);
  if (!a) return { ok: false, log: [], skipped: [], error: `unknown agent: ${slug}` };
  const log: string[] = [];
  const skipped: string[] = [];
  try {
    const { spec, error } = resolveLaunch();
    if (a.mcp) {
      if (error || !spec) return { ok: false, log, skipped, error };
      let done = false;
      if (a.cli && hasCli(a.cli.bin)) {
        const r = spawnSync(a.cli.bin, a.cli.args(spec), { stdio: "pipe" });
        if (r.status === 0) {
          log.push(`mcp → ${a.name} (${a.cli.bin} mcp add)`);
          done = true;
        } else skipped.push(`${a.cli.bin} mcp add 失败，已回退到写配置文件`);
      }
      if (!done) {
        writeMcpFile(a.mcp, spec);
        log.push(`mcp → ${a.mcp.file}`);
      }
    }
    installSkillFiles(a, log);
    if (a.note) skipped.push(a.note);
    return { ok: true, log, skipped };
  } catch (err) {
    return { ok: false, log, skipped, error: err instanceof Error ? err.message : String(err) };
  }
}

export function uninstallAgent(slug: string): { ok: boolean; log: string[]; error?: string } {
  const a = AGENTS.find((x) => x.slug === slug);
  if (!a) return { ok: false, log: [], error: `unknown agent: ${slug}` };
  const log: string[] = [];
  try {
    if (a.mcp) {
      removeMcpFile(a.mcp);
      log.push(`mcp 配置已移除 ← ${a.mcp.file}`);
    }
    if (a.skillDir && existsSync(a.skillDir)) {
      rmSync(a.skillDir, { recursive: true, force: true });
      log.push(`skill 已移除 ← ${a.skillDir}`);
    }
    if (a.commandFile && existsSync(a.commandFile)) {
      rmSync(a.commandFile, { force: true });
      log.push(`command 已移除 ← ${a.commandFile}`);
    }
    return { ok: true, log };
  } catch (err) {
    return { ok: false, log, error: err instanceof Error ? err.message : String(err) };
  }
}
