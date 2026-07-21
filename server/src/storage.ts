import { readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ChatMessage } from "./providers/index.js";
import { SiteManifest } from "../../shared/extract.js";
import { moduleDir, dataDir } from "./paths.js";
import { readJsonFile, writeJsonAtomic } from "./jsonFile.js";

const DATA_DIR = dataDir(join(moduleDir, "..", ".data"));
const PROJECTS_FILE = join(DATA_DIR, "projects.json");
const DS_FILE = join(DATA_DIR, "design-systems.json");
// Bundled read-only design systems (DESIGN.md files). dev: server/src → ../brain
// ; bundled: server/dist → ./brain (copied by build.mjs alongside skills/craft).
const BUILTIN_DS_DIR = existsSync(join(moduleDir, "brain", "design-systems"))
  ? join(moduleDir, "brain", "design-systems")
  : join(moduleDir, "..", "brain", "design-systems");

export interface ArtifactVersion {
  id: string;
  html: string;
  label: string;
  createdAt: number;
  kind?: "html" | "markdown" | "multifile"; // deliverable renderer
  source?: "ai" | "manual" | "restore"; // provenance
  prompt?: string; // user prompt snippet that produced an AI version
  restoreFromVersionId?: string;
  // Multi-file artifact (kind === "multifile"): a preview.entry HTML plus sibling
  // files (styles.css / app.js / …) served over /api/mf. `html` mirrors the entry
  // file so single-file code paths (export/handoff) keep working.
  files?: Record<string, string>;
  entry?: string;
  // Site / flow prototype (a multifile artifact from a ```vdsite block): page
  // list + optional user-flow metadata from the optional site.json manifest.
  site?: SiteManifest;
}

export interface Project {
  id: string;
  name: string;
  messages: ChatMessage[];
  artifacts: ArtifactVersion[];
  liveArtifactId?: string | null;
  favorite?: boolean;
  parentProjectId?: string | null;
  sessionStartedAt?: number;
  updatedAt: number;
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): Project[] {
  ensureDir();
  return readJsonFile<Project[]>(PROJECTS_FILE, []);
}

function writeAll(projects: Project[]) {
  ensureDir();
  writeJsonAtomic(PROJECTS_FILE, projects);
}

export function listProjects(): { id: string; name: string; updatedAt: number; favorite?: boolean }[] {
  return readAll()
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, favorite: p.favorite }))
    .sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false) || b.updatedAt - a.updatedAt);
}

export function getProject(id: string): Project | undefined {
  return readAll().find((p) => p.id === id);
}

export function saveProject(project: Project): Project {
  const all = readAll();
  project.updatedAt = Date.now();
  const idx = all.findIndex((p) => p.id === project.id);
  if (idx >= 0) all[idx] = project;
  else all.push(project);
  writeAll(all);
  return project;
}

export function deleteProject(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

// ---- Design systems ---------------------------------------------------------
// A design system here is a named context blob (tokens / brand rules / voice)
// injected into the system prompt when selected (spec §8, minimal form).

export interface DesignSystem {
  id: string;
  name: string;
  content: string; // prose spec (the 9-section DESIGN.md), injected as intent/voice
  tokensCss?: string; // optional machine-readable :root {} token contract (pasted verbatim)
  category?: string; // optional grouping label
  builtin?: boolean; // bundled read-only preset (from awesome-design-md)
  updatedAt: number;
}

// Prettify a brand slug into a display name: "linear.app" → "Linear.app",
// "bmw-m" → "Bmw M".
function prettyBrand(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Bundled DESIGN.md presets. Cached after first read (files never change at
// runtime). ids are prefixed so they can't collide with user design systems.
let builtinCache: DesignSystem[] | null = null;
function loadBuiltinDesignSystems(): DesignSystem[] {
  if (builtinCache) return builtinCache;
  const out: DesignSystem[] = [];
  try {
    for (const brand of readdirSync(BUILTIN_DS_DIR)) {
      const file = join(BUILTIN_DS_DIR, brand, "DESIGN.md");
      if (!existsSync(file)) continue;
      // drop the leading YAML front-matter (version/name/description metadata)
      // so both the injected content and the card preview start at the spec.
      const raw = readFileSync(file, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "");
      // Machine-readable :root {} token contract — the strongest brand-fidelity
      // path (buildSystem pastes it verbatim + forbids bare hex outside :root).
      const tokensFile = join(BUILTIN_DS_DIR, brand, "tokens.css");
      const tokensCss = existsSync(tokensFile) ? readFileSync(tokensFile, "utf8").trim() : undefined;
      out.push({
        id: `builtin:${brand}`,
        name: prettyBrand(brand),
        content: raw,
        ...(tokensCss ? { tokensCss } : {}),
        category: "内置 · awesome-design-md",
        builtin: true,
        updatedAt: 0,
      });
    }
  } catch {
    /* dir missing — no built-ins */
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  builtinCache = out;
  return out;
}

function readDS(): DesignSystem[] {
  ensureDir();
  return readJsonFile<DesignSystem[]>(DS_FILE, []);
}

function writeDS(list: DesignSystem[]) {
  ensureDir();
  writeJsonAtomic(DS_FILE, list);
}

export function listDesignSystems(): DesignSystem[] {
  const user = readDS().sort((a, b) => b.updatedAt - a.updatedAt);
  const userIds = new Set(user.map((d) => d.id));
  // user design systems first (most recent), then bundled presets (excluding
  // any a user copy has shadowed by id)
  const builtins = loadBuiltinDesignSystems().filter((d) => !userIds.has(d.id));
  return [...user, ...builtins];
}

// Strip a leading YAML front-matter block (shared with the builtin loader).
const stripFm = (s: string) => s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "");

export function getDesignSystem(id: string, lang?: string): DesignSystem | undefined {
  const user = readDS().find((d) => d.id === id);
  if (user) return user;
  const builtin = loadBuiltinDesignSystems().find((d) => d.id === id);
  if (!builtin) return undefined;
  // Prefer a localized DESIGN-<lang>.md for built-ins when the request is non-English.
  if (lang && lang !== "en" && id.startsWith("builtin:")) {
    const brand = id.slice("builtin:".length);
    const locFile = join(BUILTIN_DS_DIR, brand, `DESIGN-${lang}.md`);
    if (existsSync(locFile)) {
      try {
        return { ...builtin, content: stripFm(readFileSync(locFile, "utf8")) };
      } catch {
        /* fall back to the base content */
      }
    }
  }
  return builtin;
}

export function saveDesignSystem(ds: DesignSystem): DesignSystem {
  const all = readDS();
  ds.updatedAt = Date.now();
  const idx = all.findIndex((d) => d.id === ds.id);
  if (idx >= 0) all[idx] = ds;
  else all.push(ds);
  writeDS(all);
  return ds;
}

export function deleteDesignSystem(id: string): void {
  writeDS(readDS().filter((d) => d.id !== id));
}
