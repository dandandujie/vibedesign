import { StreamFn, readSSE, dataLines, trimTrailingSlash, safeResponseText } from "./types.js";

// OpenAI-compatible Chat Completions API. Also covers most OpenAI-compatible
// custom endpoints (LM Studio, vLLM, OpenRouter, DeepSeek, etc.).
// POST {baseUrl}/chat/completions  — SSE with choices[].delta.content.
export const streamOpenAI: StreamFn = async function* (req) {
  const { system, messages, config, signal } = req;
  const url = `${trimTrailingSlash(config.baseUrl)}/chat/completions`;
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
      max_tokens: config.maxTokens ?? 16000,
      ...(config.reasoning && config.effort ? { reasoning_effort: config.effort } : {}),
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => {
          if (!m.images?.length) return { role: m.role, content: m.content };
          return {
            role: m.role,
            content: [
              ...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
              { type: "text", text: m.content },
            ],
          };
        }),
      ],
    }),
  });

  if (!res.ok) {
    yield { type: "error", error: `OpenAI ${res.status}: ${await safeResponseText(res)}` };
    return;
  }

  for await (const block of readSSE(res, signal)) {
    for (const data of dataLines(block)) {
      if (!data || data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        const delta = evt.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield { type: "text", text: delta };
      } catch {
        /* ignore */
      }
    }
  }
  yield { type: "done" };
};
