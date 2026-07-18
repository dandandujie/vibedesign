export type ProviderFormat = "anthropic" | "openai" | "openai-responses" | "gemini";

export type Effort = "low" | "medium" | "high";

export interface ProviderConfig {
  id: string;
  name: string;
  format: ProviderFormat;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  reasoning?: boolean;
  effort?: Effort;
  description?: string;
}

export async function fetchVersion(): Promise<string> {
  try {
    const r = await fetch("/api/version", { cache: "no-store" });
    return (await r.json()).version as string;
  } catch {
    return "0.0.0";
  }
}

export interface RepoFile {
  path: string;
  content: string;
}

export async function fetchGithubRepo(url: string): Promise<{ repo: string; files: RepoFile[] }> {
  const r = await fetch("/api/github-repo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? "拉取失败");
  return r.json();
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // data URLs
}

export interface DesignSystem {
  id: string;
  name: string;
  content: string;
  tokensCss?: string; // optional :root {} token contract, pasted verbatim into artifacts
  category?: string;
  builtin?: boolean; // bundled read-only preset (from awesome-design-md)
  updatedAt: number;
}

export async function listDesignSystems(): Promise<DesignSystem[]> {
  const r = await fetch("/api/design-systems");
  return r.json();
}

export async function saveDesignSystem(ds: DesignSystem): Promise<void> {
  await fetch(`/api/design-systems/${ds.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ds),
  });
}

export async function deleteDesignSystem(id: string): Promise<void> {
  await fetch(`/api/design-systems/${id}`, { method: "DELETE" });
}

export interface Meta {
  providers: ProviderConfig[];
  activeProviderId: string | null;
  defaultBaseUrls: Record<ProviderFormat, string>;
  skills: { id: string; title: string }[];
}

export async function fetchMeta(): Promise<Meta> {
  const r = await fetch("/api/meta");
  return r.json();
}

export async function saveProvider(p: ProviderConfig): Promise<void> {
  const r = await fetch("/api/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!r.ok) {
    const msg = await r
      .json()
      .then((b) => b.error as string)
      .catch(() => `HTTP ${r.status}`);
    throw new Error(msg || `HTTP ${r.status}`);
  }
}

export async function deleteProvider(id: string): Promise<void> {
  await fetch(`/api/providers/${id}`, { method: "DELETE" });
}

export async function setActiveProvider(id: string): Promise<void> {
  await fetch("/api/providers/active", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

export interface StreamHandlers {
  onText: (delta: string) => void;
  onStatus?: (phase: AgentPhase) => void;
  onHeartbeat?: () => void;
  onError: (msg: string) => void;
  onDone: () => void;
}

export type AgentPhase = "preparing" | "requesting" | "generating" | "finalizing";
export type AgentRunStatus = "running" | "completed" | "stopped" | "error";

export interface AgentRunState {
  phase: AgentPhase;
  status: AgentRunStatus;
  startedAt: number;
  phaseStartedAt: number;
  lastActivityAt: number;
  endedAt?: number;
}

// Stream a chat completion. Returns an abort function.
export function streamChat(
  body: {
    messages: ChatMessage[];
    providerId?: string | null;
    skillId?: string | null;
    designSystemId?: string | null;
    extraInstruction?: string | null;
    lang?: string; // "zh" | "en" — picks a localized DESIGN-<lang>.md when available
  },
  handlers: StreamHandlers,
): () => void {
  const ac = new AbortController();
  (async () => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.body) {
        handlers.onError("no response body");
        handlers.onDone();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = block.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim());
            if (evt.type === "text") handlers.onText(evt.text);
            else if (evt.type === "status") handlers.onStatus?.(evt.phase as AgentPhase);
            else if (evt.type === "heartbeat") handlers.onHeartbeat?.();
            else if (evt.type === "error") handlers.onError(evt.error);
            else if (evt.type === "done") {
              handlers.onDone();
              return;
            }
          } catch {
            /* ignore partial */
          }
        }
      }
      handlers.onDone();
    } catch (err) {
      if (!ac.signal.aborted) handlers.onError(err instanceof Error ? err.message : String(err));
      handlers.onDone();
    }
  })();
  return () => ac.abort();
}
