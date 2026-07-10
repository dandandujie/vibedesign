import { ChatMessage } from "./api";
import { ArtifactVersion } from "./types";

// Comment pin attached to an element in the canvas (Comment mode).
export interface CommentPin {
  id: string;
  path: string; // css path of target element
  text: string;
  resolved: boolean;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  messages: ChatMessage[];
  artifacts: ArtifactVersion[];
  activeVersionId?: string | null;
  comments?: CommentPin[];
  designSystemId?: string | null;
  favorite?: boolean;
  updatedAt: number;
}

export interface ProjectListItem {
  id: string;
  name: string;
  updatedAt: number;
  favorite?: boolean;
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const r = await fetch("/api/projects");
  return r.json();
}

export async function getProject(id: string): Promise<Project | null> {
  const r = await fetch(`/api/projects/${id}`);
  if (!r.ok) return null;
  return r.json();
}

export async function saveProject(p: Project): Promise<void> {
  await fetch(`/api/projects/${p.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(p),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await fetch(`/api/projects/${id}`, { method: "DELETE" });
}

export function newProject(name = "Untitled"): Project {
  return {
    id: crypto.randomUUID().slice(0, 8),
    name,
    messages: [],
    artifacts: [],
    activeVersionId: null,
    comments: [],
    updatedAt: Date.now(),
  };
}
