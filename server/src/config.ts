import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ProviderConfig } from "./providers/index.js";
import { moduleDir, dataDir } from "./paths.js";

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
  if (!existsSync(CONFIG_FILE)) return { providers: [], activeProviderId: null };
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return { providers: [], activeProviderId: null };
  }
}

function write(cfg: AppConfig) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
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
  // Preserve existing key when the UI sends a masked placeholder.
  if (idx >= 0 && (!p.apiKey || /^•+$/.test(p.apiKey))) {
    p.apiKey = cfg.providers[idx].apiKey;
  }
  if (idx >= 0) cfg.providers[idx] = p;
  else cfg.providers.push(p);
  if (!cfg.activeProviderId) cfg.activeProviderId = p.id;
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
