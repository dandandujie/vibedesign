#!/usr/bin/env node
// Install Vibedesign integration into local coding agents:
//   node integrations/install.mjs [agent ...|all]   (default: all)
//
// Architecture: pure per-agent PLAN functions (below) return a list of actions;
// the EXECUTOR performs them (file writes are backed up to <file>.bak first).
// Everything is idempotent — re-running converges to the same state.
//
// Supported agents (MCP server "vibedesign": `node <repo>/server/dist/mcp.cjs`):
//   claude      — `claude mcp add --scope user` (fallback: ~/.claude.json mcpServers)
//                 + /design skill at ~/.claude/skills/design/
//   codex       — `codex mcp add` (fallback: [mcp_servers.vibedesign] in ~/.codex/config.toml)
//                 + /design skill at ~/.codex/skills/design/
//   cursor      — ~/.cursor/mcp.json mcpServers (no skill)
//   opencode    — ~/.config/opencode/opencode.json, special shape: top key "mcp",
//                 command as a single array, "enabled": true
//                 + command file ~/.config/opencode/commands/design.md
//   pi          — skill-only (no native MCP; prints a note about pi-mcp-adapter):
//                 ~/.pi/agent/skills/design/SKILL.md + ~/.pi/agent/prompts/design.md
//   hermes      — `hermes mcp add` (fallback: mcp_servers: block in ~/.hermes/config.yaml)
//   grok        — `grok mcp add` (fallback: [mcp_servers.vibedesign] in ~/.grok/config.toml)
//                 + /design skill at ~/.grok/skills/design/
//   antigravity — ~/.gemini/antigravity/mcp_config.json mcpServers
//                 + /design skill at ~/.gemini/config/skills/design/
//   kimi        — ~/.kimi-code/mcp.json mcpServers (Kimi Code CLI)
//                 + /design skill at ~/.kimi-code/skills/design/
//   qoder       — `qodercli mcp add` (fallback: ~/.qoder.json mcpServers)
//                 + command file ~/.qoder/commands/design.md
//   trae        — app-data Trae/User/mcp.json mcpServers (macOS ~/Library/Application Support,
//                 Windows %APPDATA%, Linux ~/.config); GUI note, no skill
//
// Requires server/dist/mcp.cjs — run `cd server && npm run bundle` first.

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_ENTRY = join(repoRoot, "server", "dist", "mcp.cjs");
const SKILL_SRC = join(repoRoot, "integrations", "design", "SKILL.md");
const HOME = homedir();

const requested = process.argv.slice(2);

if (!existsSync(MCP_ENTRY)) {
  console.error(`✗ ${MCP_ENTRY} not found. Build it first:  cd server && npm run bundle`);
  process.exit(1);
}

const done = [];
const skipped = [];

// ---- shared payloads --------------------------------------------------------

const mcpServerEntry = { command: "node", args: [MCP_ENTRY] };

// Short /design command for agents whose convention is a markdown command file
// (opencode, qoder, pi prompts) instead of a full skill directory.
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

// ---- executor ---------------------------------------------------------------

function backup(path) {
  if (existsSync(path)) copyFileSync(path, path + ".bak");
}

function hasCli(name) {
  const r = spawnSync(name, ["--version"], { stdio: "ignore" });
  return r.status === 0;
}

// Deep-merge ONLY the entry [topKey][key] into a JSON config file.
// Refuses to touch a file that is not valid JSON.
function writeJsonEntry(file, topKey, key, value) {
  let data = {};
  if (existsSync(file)) {
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      console.error(`✗ ${file} is not valid JSON — left untouched (fix it manually)`);
      return false;
    }
  }
  backup(file);
  data[topKey] = { ...(data[topKey] ?? {}), [key]: value };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return true;
}

// Remove any existing [mcp_servers.vibedesign] table, then append a fresh one.
function writeTomlEntry(file) {
  let text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const kept = [];
  let skipping = false;
  for (const line of text.split("\n")) {
    if (/^\s*\[/.test(line)) skipping = /^\s*\[mcp_servers\.vibedesign\]\s*$/.test(line);
    if (!skipping) kept.push(line);
  }
  text = kept.join("\n").trimEnd();
  const block =
    `[mcp_servers.vibedesign]\ncommand = "node"\nargs = ["${MCP_ENTRY.replace(/\\/g, "\\\\")}"]\n`;
  backup(file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, (text ? text + "\n\n" : "") + block);
}

// Remove any existing `vibedesign:` entry under `mcp_servers:`, then insert a
// fresh one; appends the whole `mcp_servers:` block if the key is missing.
function writeYamlEntry(file) {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
  const entry = ["  vibedesign:", "    command: node", `    args: ["${MCP_ENTRY}"]`];
  const kept = [];
  let inMcpServers = false;
  let skipBelow = -1;
  for (const line of lines) {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    if (skipBelow >= 0) {
      if (trimmed === "" || indent > skipBelow) continue;
      skipBelow = -1;
    }
    if (trimmed !== "" && indent === 0) inMcpServers = /^mcp_servers\s*:/.test(trimmed);
    if (inMcpServers && indent === 2 && /^vibedesign\s*:/.test(trimmed)) {
      skipBelow = 2;
      continue;
    }
    kept.push(line);
  }
  let text = kept.join("\n").trimEnd();
  const idx = kept.findIndex((l) => /^mcp_servers\s*:/.test(l));
  if (idx === -1) {
    text = (text ? text + "\n\n" : "") + ["mcp_servers:", ...entry].join("\n") + "\n";
  } else {
    kept.splice(idx + 1, 0, ...entry);
    text = kept.join("\n").trimEnd() + "\n";
  }
  backup(file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function installSkill(dir) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(SKILL_SRC, join(dir, "SKILL.md"));
  done.push(`skill  → ${dir}/SKILL.md`);
}

function writeTextFile(file, content, label) {
  backup(file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  done.push(`${label} → ${file}`);
}

function exec(actions) {
  for (const a of actions) {
    switch (a.t) {
      case "cli": {
        if (hasCli(a.bin)) {
          const r = spawnSync(a.bin, a.args, { stdio: "inherit" });
          if (r.status === 0) {
            done.push(a.label);
            break;
          }
          skipped.push(`${a.bin} mcp add failed — falling back to file config`);
        }
        exec(a.fallback);
        break;
      }
      case "json":
        if (writeJsonEntry(a.file, a.topKey, a.key, a.value)) done.push(a.label);
        break;
      case "toml":
        writeTomlEntry(a.file);
        done.push(a.label);
        break;
      case "yaml":
        writeYamlEntry(a.file);
        done.push(a.label);
        break;
      case "skill":
        installSkill(a.dir);
        break;
      case "write":
        writeTextFile(a.file, a.content, a.label);
        break;
      case "note":
        skipped.push(a.msg);
        break;
    }
  }
}

// ---- action factories --------------------------------------------------------

const cli = (bin, args, label, fallback) => ({ t: "cli", bin, args, label, fallback });
const jsonMcp = (file, label) => ({
  t: "json", file, topKey: "mcpServers", key: "vibedesign", value: mcpServerEntry,
  label: label ?? `mcp    → ${file} (mcpServers.vibedesign)`,
});
const skill = (...segments) => ({ t: "skill", dir: join(HOME, ...segments) });
const command = (file) => ({ t: "write", file, content: COMMAND_MD, label: "command" });

// ---- per-agent plans ----------------------------------------------------------

const plans = {
  claude: () => [
    cli("claude", ["mcp", "add", "--scope", "user", "vibedesign", "--", "node", MCP_ENTRY],
      "mcp    → claude (claude mcp add --scope user vibedesign)",
      [jsonMcp(join(HOME, ".claude.json"))]),
    skill(".claude", "skills", "design"),
  ],

  codex: () => [
    cli("codex", ["mcp", "add", "vibedesign", "--", "node", MCP_ENTRY],
      "mcp    → codex (codex mcp add vibedesign)",
      [{ t: "toml", file: join(HOME, ".codex", "config.toml"), label: `mcp    → ${join(HOME, ".codex", "config.toml")} ([mcp_servers.vibedesign])` }]),
    skill(".codex", "skills", "design"),
  ],

  cursor: () => [jsonMcp(join(HOME, ".cursor", "mcp.json"))],

  opencode: () => [
    {
      t: "json",
      file: join(HOME, ".config", "opencode", "opencode.json"),
      topKey: "mcp",
      key: "vibedesign",
      value: { type: "local", command: ["node", MCP_ENTRY], enabled: true },
      label: `mcp    → ${join(HOME, ".config", "opencode", "opencode.json")} (mcp.vibedesign, local)`,
    },
    command(join(HOME, ".config", "opencode", "commands", "design.md")),
  ],

  pi: () => [
    { t: "note", msg: "pi has no native MCP support — skill installed with HTTP fallback flow (optionally see the community pi-mcp-adapter)" },
    skill(".pi", "agent", "skills", "design"),
    command(join(HOME, ".pi", "agent", "prompts", "design.md")),
  ],

  hermes: () => [
    cli("hermes", ["mcp", "add", "vibedesign", "--command", "node", "--args", MCP_ENTRY],
      "mcp    → hermes (hermes mcp add vibedesign)",
      [{ t: "yaml", file: join(HOME, ".hermes", "config.yaml"), label: `mcp    → ${join(HOME, ".hermes", "config.yaml")} (mcp_servers.vibedesign)` }]),
  ],

  grok: () => [
    cli("grok", ["mcp", "add", "vibedesign", "--", "node", MCP_ENTRY],
      "mcp    → grok (grok mcp add vibedesign)",
      [{ t: "toml", file: join(HOME, ".grok", "config.toml"), label: `mcp    → ${join(HOME, ".grok", "config.toml")} ([mcp_servers.vibedesign])` }]),
    skill(".grok", "skills", "design"),
  ],

  antigravity: () => [
    jsonMcp(join(HOME, ".gemini", "antigravity", "mcp_config.json")),
    skill(".gemini", "config", "skills", "design"),
  ],

  kimi: () => [
    jsonMcp(join(HOME, ".kimi-code", "mcp.json")),
    skill(".kimi-code", "skills", "design"),
  ],

  qoder: () => [
    cli("qodercli", ["mcp", "add", "vibedesign", "--", "node", MCP_ENTRY],
      "mcp    → qoder (qodercli mcp add vibedesign)",
      [jsonMcp(join(HOME, ".qoder.json"))]),
    command(join(HOME, ".qoder", "commands", "design.md")),
  ],

  trae: () => {
    const file =
      process.platform === "darwin"
        ? join(HOME, "Library", "Application Support", "Trae", "User", "mcp.json")
        : process.platform === "win32"
          ? join(process.env.APPDATA ?? join(HOME, "AppData", "Roaming"), "Trae", "User", "mcp.json")
          : join(HOME, ".config", "Trae", "User", "mcp.json");
    return [
      jsonMcp(file),
      { t: "note", msg: "trae — you can also manage MCP servers in the IDE GUI: Settings → MCP" },
    ];
  },
};

// ---- main ---------------------------------------------------------------------

const all = Object.keys(plans);
let targets;
if (requested.length === 0 || requested.includes("all")) {
  targets = all;
} else {
  const bad = requested.filter((t) => !all.includes(t));
  if (bad.length > 0) {
    console.error(`unknown agent(s): ${bad.join(", ")}`);
    console.error(`usage: node integrations/install.mjs [${[...all, "all"].join("|")}]`);
    process.exit(1);
  }
  targets = requested;
}

for (const name of targets) exec(plans[name]());

console.log(`\nVibedesign agent integration (${targets.join(", ")}):`);
for (const line of done) console.log(`  ✓ ${line}`);
for (const line of skipped) console.log(`  ! ${line}`);
console.log(`
Next:
  1. Make sure Vibedesign is running (desktop app, or npm run dev).
  2. Restart your agent CLI, then ask it to design something — or type /design
     (Claude Code / Pi get the /design command from the installed skill).
  3. The agent returns an editor URL — watch and refine the design on canvas.`);
