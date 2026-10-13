import { postJson } from "./http.js";
import { LLMError, type LLMProvider, type LLMRequest, type LLMResponse } from "./types.js";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const data = await postJson<GeminiResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
          maxOutputTokens: req.maxOutputTokens ?? 2048,
        },
      },
      { "x-goog-api-key": this.apiKey },
    );

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new LLMError("Gemini returned an empty response", undefined, true);

    return {
      text,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}
