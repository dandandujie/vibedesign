// Unified provider abstraction. Every concrete adapter (anthropic / openai /
// openai-responses / gemini) translates this one internal request shape into
// its own wire format and normalizes the streaming response back into a common
// AsyncGenerator<StreamEvent>. This is what lets the UI stay provider-agnostic.

export type ProviderFormat = "anthropic" | "openai" | "openai-responses" | "gemini";

export type Effort = "low" | "medium" | "high";

export interface ProviderConfig {
  id: string;
  name: string;
  format: ProviderFormat;
  baseUrl: string; // provider root, e.g. https://api.openai.com/v1
  apiKey: string;
  model: string;
  maxTokens?: number;
  reasoning?: boolean; // model supports thinking/effort control
  effort?: Effort; // current effort when reasoning is on
  description?: string; // shown in the model picker
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // data URLs (user messages only)
}

// Split a data URL into its media type and raw base64 payload.
export function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return m ? { mime: m[1], base64: m[2] } : null;
}

export interface StreamRequest {
  system: string;
  messages: ChatMessage[];
  config: ProviderConfig;
  signal: AbortSignal;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

export type StreamFn = (req: StreamRequest) => AsyncGenerator<StreamEvent>;

const MAX_SSE_BUFFER_BYTES = 1024 * 1024;

// Shared helper: turn a fetch Response body into an async iterator of decoded
// text chunks. Works for all SSE-style provider streams.
export async function* readSSE(res: Response, signal: AbortSignal): AsyncGenerator<string> {
  if (!res.body) throw new Error("response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      // Emit complete SSE events (separated by blank lines) as they arrive.
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer)) !== null) {
        const idx = match.index;
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + match[0].length);
        if (Buffer.byteLength(chunk, "utf8") > MAX_SSE_BUFFER_BYTES) {
          await reader.cancel();
          throw new Error(`SSE event exceeds ${MAX_SSE_BUFFER_BYTES} bytes`);
        }
        yield chunk;
      }
      if (Buffer.byteLength(buffer, "utf8") > MAX_SSE_BUFFER_BYTES) {
        await reader.cancel();
        throw new Error(`SSE event exceeds ${MAX_SSE_BUFFER_BYTES} bytes`);
      }
      if (done) break;
    }
    if (buffer.trim()) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

// Extract the `data:` payload lines from one SSE event block.
export function dataLines(block: string): string[] {
  const out: string[] = [];
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trimStart();
    if (line.startsWith("data:")) out.push(line.slice(5).trim());
  }
  return out;
}

export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function safeResponseText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
