// Shared export helpers — used by SharePopover and the version manager.
import { buildDesignManifest, buildHandoffMd, buildSiteHandoffMd, buildSiteManifest } from "./handoff";
import { ArtifactVersion } from "./types";

export function safeName(projectName: string): string {
  return (projectName || "design").replace(/[^\w一-龥-]+/g, "-");
}

export function download(name: string, content: string | Blob, type = "text/html") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Single-file handoff bundle: index.html + agent-facing brief + manifest.
export async function exportHandoffZip(html: string, projectName: string) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("index.html", html);
  zip.file("DESIGN-HANDOFF.md", buildHandoffMd(html, projectName));
  zip.file("DESIGN-MANIFEST.json", JSON.stringify(buildDesignManifest(html, projectName), null, 2));
  download(`${safeName(projectName)}-handoff.zip`, await zip.generateAsync({ type: "blob" }), "application/zip");
}

// Multi-page site / flow prototype: every file as-is + site manifest + brief.
export async function exportSiteZip(version: ArtifactVersion, projectName: string) {
  if (!version.files) return;
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [path, content] of Object.entries(version.files)) zip.file(path, content);
  const entry = version.entry ?? "index.html";
  zip.file("SITE-HANDOFF.md", buildSiteHandoffMd(projectName, entry, version.files, version.site));
  zip.file("SITE-MANIFEST.json", JSON.stringify(buildSiteManifest(projectName, entry, version.files, version.site), null, 2));
  download(`${safeName(projectName)}-site.zip`, await zip.generateAsync({ type: "blob" }), "application/zip");
}

// Per-version export for the version manager: multifile → ZIP, html/markdown →
// standalone HTML file.
export async function exportVersion(version: ArtifactVersion, projectName: string) {
  if (version.kind === "multifile" && version.files) return exportSiteZip(version, projectName);
  download(`${safeName(projectName)}-${version.label || version.id}.html`, version.html);
}
