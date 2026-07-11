import { readFileSync, existsSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { moduleDir } from "./paths.js";

// Shared, read-only deck runtime assets (open-design's html-ppt base.css /
// runtime.js / themes / animations), served at /api/deck-assets/<path>. Decks
// reference them by that stable URL, so the html-ppt authoring workflow works
// unchanged without re-emitting the runtime per artifact.
// dev: server/src → ../brain/deck-assets ; bundled: server/dist → ./brain/deck-assets
const DECK_ASSETS_DIR = existsSync(join(moduleDir, "brain", "deck-assets"))
  ? join(moduleDir, "brain", "deck-assets")
  : join(moduleDir, "..", "brain", "deck-assets");

const CONTENT_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

export interface ServedAsset {
  buffer: Buffer;
  contentType: string;
}

export function serveDeckAsset(rawPath: string): ServedAsset | null {
  const rel = normalize(decodeURIComponent(rawPath)).replace(/^([/\\]|\.\.([/\\]|$))+/, "");
  // reject any residual traversal after normalization
  if (!rel || rel.split(/[/\\]/).some((seg) => seg === "..")) return null;
  const full = join(DECK_ASSETS_DIR, rel);
  // ensure the resolved path stays inside the assets dir
  if (full !== DECK_ASSETS_DIR && !full.startsWith(DECK_ASSETS_DIR + sep)) return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  return { buffer: readFileSync(full), contentType: CONTENT_TYPES[ext] ?? "application/octet-stream" };
}
