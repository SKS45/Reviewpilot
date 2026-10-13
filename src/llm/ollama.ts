import { postJson } from "./http.js";
import { LLMError, type LLMProvider, type LLMRequest, type LLMResponse } from "./types.js";

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

/** Local models via Ollama: free, private, and good enough for development. */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const data = await postJson<OllamaChatResponse>(
      `${this.baseUrl}/api/chat`,
      {
        model: this.model,
        stream: false,
        format: "json",
        options: { temperature: 0.2, num_predict: req.maxOutputTokens ?? 2048 },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      },
      {},
      { timeoutMs: 300_000 }, // local CPU inference can be slow
    );

    const text = data.message?.content ?? "";
    if (!text) throw new LLMError("Ollama returned an empty response", undefined, true);

    return {
      text,
      usage: { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 },
    };
  }
}
