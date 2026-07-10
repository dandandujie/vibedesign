export type ProviderFormat = "anthropic" | "openai" | "openai-responses" | "gemini";

export interface ProviderConfig {
  id: string;
  name: string;
  format: ProviderFormat;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
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
  await fetch("/api/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(p),
  });
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
  onError: (msg: string) => void;
  onDone: () => void;
}

// Stream a chat completion. Returns an abort function.
export function streamChat(
  body: {
    messages: ChatMessage[];
    providerId?: string | null;
    skillId?: string | null;
    designSystemId?: string | null;
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
