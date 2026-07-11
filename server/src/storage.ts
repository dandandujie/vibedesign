import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ChatMessage } from "./providers/index.js";
import { moduleDir, dataDir } from "./paths.js";

const DATA_DIR = dataDir(join(moduleDir, "..", ".data"));
const PROJECTS_FILE = join(DATA_DIR, "projects.json");
const DS_FILE = join(DATA_DIR, "design-systems.json");

export interface ArtifactVersion {
  id: string;
  html: string;
  label: string;
  createdAt: number;
  kind?: "html" | "markdown"; // deliverable renderer
  source?: "ai" | "manual" | "restore"; // provenance
  prompt?: string; // user prompt snippet that produced an AI version
  restoreFromVersionId?: string;
}

export interface Project {
  id: string;
  name: string;
  messages: ChatMessage[];
  artifacts: ArtifactVersion[];
  liveArtifactId?: string | null;
  favorite?: boolean;
  updatedAt: number;
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): Project[] {
  ensureDir();
  if (!existsSync(PROJECTS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(PROJECTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeAll(projects: Project[]) {
  ensureDir();
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
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
  updatedAt: number;
}

function readDS(): DesignSystem[] {
  ensureDir();
  if (!existsSync(DS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeDS(list: DesignSystem[]) {
  ensureDir();
  writeFileSync(DS_FILE, JSON.stringify(list, null, 2));
}

export function listDesignSystems(): DesignSystem[] {
  return readDS().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDesignSystem(id: string): DesignSystem | undefined {
  return readDS().find((d) => d.id === id);
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
