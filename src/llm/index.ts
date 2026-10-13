import type { Config } from "../config.js";
import { GeminiProvider } from "./gemini.js";
import { GroqProvider } from "./groq.js";
import { OllamaProvider } from "./ollama.js";
import type { LLMProvider } from "./types.js";

export function createProvider(cfg: Config): LLMProvider {
  switch (cfg.LLM_PROVIDER) {
    case "gemini":
      if (!cfg.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required when LLM_PROVIDER=gemini");
      return new GeminiProvider(cfg.GEMINI_API_KEY, cfg.GEMINI_MODEL);
    case "groq":
      if (!cfg.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required when LLM_PROVIDER=groq");
      return new GroqProvider(cfg.GROQ_API_KEY, cfg.GROQ_MODEL);
    case "ollama":
      return new OllamaProvider(cfg.OLLAMA_URL, cfg.OLLAMA_MODEL);
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${String(cfg.LLM_PROVIDER)}`);
  }
}

export type { LLMProvider, LLMRequest, LLMResponse } from "./types.js";
