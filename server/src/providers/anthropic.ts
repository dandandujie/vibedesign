import { StreamFn, readSSE, dataLines, trimTrailingSlash, parseDataUrl, safeResponseText } from "./types.js";

// Anthropic Messages API (native format).
// POST {baseUrl}/v1/messages  — SSE with content_block_delta events.
export const streamAnthropic: StreamFn = async function* (req) {
  const { system, messages, config, signal } = req;
  const url = `${trimTrailingSlash(config.baseUrl)}/v1/messages`;
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens ?? 16000,
      system,
      stream: true,
      ...(config.reasoning && config.effort
        ? {
            thinking: {
              type: "enabled",
              budget_tokens: { low: 2048, medium: 8192, high: 16384 }[config.effort],
            },
          }
        : {}),
      messages: messages.map((m) => {
        if (!m.images?.length) return { role: m.role, content: m.content };
        const blocks: unknown[] = m.images
          .map(parseDataUrl)
          .filter(Boolean)
          .map((img) => ({
            type: "image",
            source: { type: "base64", media_type: img!.mime, data: img!.base64 },
          }));
        blocks.push({ type: "text", text: m.content });
        return { role: m.role, content: blocks };
      }),
    }),
  });

  if (!res.ok) {
    yield { type: "error", error: `Anthropic ${res.status}: ${await safeResponseText(res)}` };
    return;
  }

  for await (const block of readSSE(res, signal)) {
    for (const data of dataLines(block)) {
      if (!data || data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          yield { type: "text", text: evt.delta.text };
        } else if (evt.type === "error") {
          yield { type: "error", error: evt.error?.message ?? "anthropic stream error" };
        }
      } catch {
        /* ignore keep-alive / partial */
      }
    }
  }
  yield { type: "done" };
};
