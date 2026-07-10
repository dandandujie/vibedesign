import { StreamFn, readSSE, dataLines, trimTrailingSlash, parseDataUrl } from "./types.js";

// Google Gemini API (generateContent, streamed).
// POST {baseUrl}/models/{model}:streamGenerateContent?alt=sse&key=KEY
// Gemini uses roles "user" and "model", and a separate system_instruction.
export const streamGemini: StreamFn = async function* (req) {
  const { system, messages, config, signal } = req;
  const base = trimTrailingSlash(config.baseUrl);
  const url = `${base}/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: messages.map((m) => {
        const parts: unknown[] = [];
        for (const url of m.images ?? []) {
          const img = parseDataUrl(url);
          if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
        }
        parts.push({ text: m.content });
        return { role: m.role === "assistant" ? "model" : "user", parts };
      }),
      generationConfig: {
        maxOutputTokens: config.maxTokens ?? 16000,
        ...(config.reasoning && config.effort
          ? { thinkingConfig: { thinkingBudget: { low: 1024, medium: 8192, high: 24576 }[config.effort] } }
          : {}),
      },
    }),
  });

  if (!res.ok) {
    yield { type: "error", error: `Gemini ${res.status}: ${await safeText(res)}` };
    return;
  }

  for await (const block of readSSE(res, signal)) {
    for (const data of dataLines(block)) {
      if (!data || data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        const parts = evt.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            // thinking 模型的思考片段带 thought:true，不属于正文
            if (p.thought) continue;
            if (typeof p.text === "string" && p.text) yield { type: "text", text: p.text };
          }
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
