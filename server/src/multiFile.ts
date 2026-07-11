import { getProject } from "./storage.js";

// Multi-file artifacts (open-design's preview.entry model) served over
// /api/mf/:projectId/:versionId/<path>. The files live inside the saved
// ArtifactVersion (files map + entry), so serving reads straight from storage —
// no sidecar dir, no lifecycle to manage. This is purely additive: single-file
// artifacts never touch this path.

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  xml: "application/xml; charset=utf-8",
};

// Normalize a request path to a files-map key: strip leading "./" and "/", drop
// any ".." segment (traversal guard), collapse to a clean relative path.
function normalizePath(p: string): string {
  const parts = decodeURIComponent(p)
    .replace(/^[./]+/, "")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..");
  return parts.join("/");
}

function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

// Resolve a file key against a files map with a couple of sensible fallbacks
// (directory-style requests, missing extension). Returns null if nothing fits.
function resolveKey(files: Record<string, string>, key: string, entry: string): string | null {
  if (!key) return entry;
  if (key in files) return key;
  if (`${key}/index.html` in files) return `${key}/index.html`;
  if (`${key}.html` in files) return `${key}.html`;
  return null;
}

export interface ServedFile {
  body: string;
  contentType: string;
}

export function serveMultiFile(projectId: string, versionId: string, rawPath: string): ServedFile | null {
  const project = getProject(projectId);
  if (!project) return null;
  const version = project.artifacts.find((a) => a.id === versionId);
  if (!version || version.kind !== "multifile" || !version.files) return null;

  const entry = version.entry && version.entry in version.files ? version.entry : Object.keys(version.files).find((k) => /\.html?$/i.test(k)) ?? "";
  const key = resolveKey(version.files, normalizePath(rawPath), entry);
  if (key === null || !(key in version.files)) return null;

  return { body: version.files[key], contentType: contentTypeFor(key) };
}
