import { postJson } from "./http.js";
import { LLMError, type LLMProvider, type LLMRequest, type LLMResponse } from "./types.js";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Groq exposes an OpenAI-compatible API, so this also works for other compatible endpoints. */
export class GroqProvider implements LLMProvider {
  readonly name = "groq";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = "https://api.groq.com/openai/v1",
  ) {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const data = await postJson<ChatCompletionResponse>(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        temperature: 0.2,
        max_tokens: req.maxOutputTokens ?? 2048,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      },
      { authorization: `Bearer ${this.apiKey}` },
    );

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new LLMError("Groq returned an empty response", undefined, true);

    return {
      text,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
