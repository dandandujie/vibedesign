import { LiveSourceSpec } from "./artifact";

export interface LiveArtifact {
  id: string;
  projectId: string;
  title: string;
  templateHtml: string;
  dataJson: unknown;
  source?: LiveSourceSpec;
  refreshStatus: "idle" | "running" | "succeeded" | "failed";
  refreshError?: string;
  createdAt: number;
  updatedAt: number;
  lastRefreshedAt?: number;
}

export async function createLiveArtifact(input: {
  projectId: string;
  title: string;
  templateHtml: string;
  dataJson: unknown;
  source?: LiveSourceSpec;
}): Promise<LiveArtifact> {
  const r = await fetch("/api/live-artifacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? "创建 Live artifact 失败");
  return r.json();
}

export async function getLiveArtifact(id: string): Promise<LiveArtifact | null> {
  const r = await fetch(`/api/live-artifacts/${id}`);
  return r.ok ? r.json() : null;
}

export async function refreshLiveArtifact(id: string, providerId?: string | null): Promise<LiveArtifact> {
  const r = await fetch(`/api/live-artifacts/${id}/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? "刷新失败");
  return r.json();
}

export async function deleteLiveArtifact(id: string): Promise<void> {
  await fetch(`/api/live-artifacts/${id}`, { method: "DELETE" });
}

export interface RefreshLogEntry {
  refreshId: string;
  event: "created" | "started" | "succeeded" | "failed" | "rolled_back";
  at: number;
  summary?: string;
}

export async function getRefreshLog(id: string): Promise<RefreshLogEntry[]> {
  const r = await fetch(`/api/live-artifacts/${id}/refreshes`);
  return r.ok ? r.json() : [];
}

export async function rollbackLiveArtifact(id: string, refreshId: string): Promise<LiveArtifact> {
  const r = await fetch(`/api/live-artifacts/${id}/rollback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshId }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? "回滚失败");
  return r.json();
}

// Preview URL for the rendered live artifact (server renders template + data).
// A cache-busting version keeps the iframe from showing stale content.
export function livePreviewUrl(id: string, version: number): string {
  return `/api/live-artifacts/${id}/preview?v=${version}`;
}
