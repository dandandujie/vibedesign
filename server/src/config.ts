import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ProviderConfig } from "./providers/index.js";
import { moduleDir, dataDir } from "./paths.js";
import { readJsonFile, writeJsonAtomic } from "./jsonFile.js";

const DATA_DIR = dataDir(join(moduleDir, "..", ".data"));
const CONFIG_FILE = join(DATA_DIR, "config.json");

interface AppConfig {
  providers: ProviderConfig[];
  activeProviderId: string | null;
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function read(): AppConfig {
  ensureDir();
  return readJsonFile<AppConfig>(CONFIG_FILE, { providers: [], activeProviderId: null });
}

function write(cfg: AppConfig) {
  ensureDir();
  writeJsonAtomic(CONFIG_FILE, cfg);
}

export function getProviders(): ProviderConfig[] {
  return read().providers;
}

export function getActiveProviderId(): string | null {
  return read().activeProviderId;
}

export function getProvider(id: string): ProviderConfig | undefined {
  return read().providers.find((p) => p.id === id);
}

// The list returned to the browser must never leak API keys — mask them.
export function getProvidersMasked(): { config: AppConfig } {
  const cfg = read();
  return {
    config: {
      ...cfg,
      providers: cfg.providers.map((p) => ({ ...p, apiKey: p.apiKey ? "••••••••" : "" })),
    },
  };
}

export function upsertProvider(p: ProviderConfig): AppConfig {
  const cfg = read();
  const idx = cfg.providers.findIndex((x) => x.id === p.id);
  const next = { ...p };
  if (/^•+$/.test(next.apiKey)) {
    const existing = idx >= 0 ? cfg.providers[idx] : undefined;
    if (!existing || existing.baseUrl !== next.baseUrl) {
      throw new Error("masked API key can only be reused for the same provider and base URL");
    }
    next.apiKey = existing.apiKey;
  }
  if (idx >= 0) cfg.providers[idx] = next;
  else cfg.providers.push(next);
  if (!cfg.activeProviderId) cfg.activeProviderId = next.id;
  write(cfg);
  return cfg;
}

export function deleteProvider(id: string): AppConfig {
  const cfg = read();
  cfg.providers = cfg.providers.filter((p) => p.id !== id);
  if (cfg.activeProviderId === id) cfg.activeProviderId = cfg.providers[0]?.id ?? null;
  write(cfg);
  return cfg;
}

export function setActiveProvider(id: string): AppConfig {
  const cfg = read();
  if (cfg.providers.some((p) => p.id === id)) cfg.activeProviderId = id;
  write(cfg);
  return cfg;
}
