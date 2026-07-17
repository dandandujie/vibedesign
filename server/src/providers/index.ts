import { ProviderFormat, StreamFn } from "./types.js";
import { streamAnthropic } from "./anthropic.js";
import { streamOpenAI } from "./openai.js";
import { streamOpenAIResponses } from "./openaiResponses.js";
import { streamGemini } from "./gemini.js";

export * from "./types.js";

const REGISTRY: Record<ProviderFormat, StreamFn> = {
  anthropic: streamAnthropic,
  openai: streamOpenAI,
  "openai-responses": streamOpenAIResponses,
  gemini: streamGemini,
};

export function getStreamFn(format: ProviderFormat): StreamFn {
  if (!Object.hasOwn(REGISTRY, format)) throw new Error(`unknown provider format: ${format}`);
  return REGISTRY[format];
}

// Sensible default base URLs, offered to the UI when adding a provider.
export const DEFAULT_BASE_URLS: Record<ProviderFormat, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  "openai-responses": "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};
