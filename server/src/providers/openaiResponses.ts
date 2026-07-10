import { StreamFn, readSSE, dataLines, trimTrailingSlash } from "./types.js";

// OpenAI Responses API (the newer format).
// POST {baseUrl}/responses  — SSE with response.output_text.delta events.
export const streamOpenAIResponses: StreamFn = async function* (req) {
  const { system, messages, config, signal } = req;
  const url = `${trimTrailingSlash(config.baseUrl)}/responses`;
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      instructions: system,
      max_output_tokens: config.maxTokens ?? 16000,
      input: messages.map((m) => {
        const textType = m.role === "assistant" ? "output_text" : "input_text";
        const content: unknown[] = [];
        if (m.role === "user" && m.images?.length) {
          for (const url of m.images) content.push({ type: "input_image", image_url: url });
        }
        content.push({ type: textType, text: m.content });
        return { role: m.role, content };
      }),
    }),
  });

  if (!res.ok) {
    yield { type: "error", error: `OpenAI-Responses ${res.status}: ${await safeText(res)}` };
    return;
  }

  for await (const block of readSSE(res, signal)) {
    for (const data of dataLines(block)) {
      if (!data || data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
          yield { type: "text", text: evt.delta };
        } else if (evt.type === "response.error" || evt.type === "error") {
          yield { type: "error", error: evt.error?.message ?? "responses stream error" };
        }
      } catch {
        /* ignore */
      }
    }
  }
  yield { type: "done" };
};

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
