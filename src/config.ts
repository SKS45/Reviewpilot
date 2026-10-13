import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  GITHUB_APP_ID: z.string().min(1, "required"),
  GITHUB_PRIVATE_KEY: z.string().min(1, "required"),
  GITHUB_WEBHOOK_SECRET: z.string().min(1, "required"),

  LLM_PROVIDER: z.enum(["gemini", "groq", "ollama"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  OLLAMA_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5-coder:7b"),

  MAX_FILES_PER_PR: z.coerce.number().int().positive().default(30),
  MAX_PATCH_CHARS: z.coerce.number().int().positive().default(24_000),
  MAX_COMMENTS_PER_PR: z.coerce.number().int().positive().default(15),
  MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const useCache = env === process.env;
  if (useCache && cached) return cached;

  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid configuration:\n  ${problems}`);
  }
  if (useCache) cached = parsed.data;
  return parsed.data;
}
