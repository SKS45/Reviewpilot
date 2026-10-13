export interface LLMRequest {
  system: string;
  user: string;
  maxOutputTokens?: number;
}

export interface LLMResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** Swap providers (Gemini, Groq, Ollama, a paid model) with one config change. */
export interface LLMProvider {
  readonly name: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
