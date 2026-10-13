import { isRecord } from "../util.js";

export const SEVERITIES = ["bug", "security", "performance", "maintainability", "test"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface RawComment {
  line: number;
  severity: Severity;
  confidence: number;
  body: string;
}

/** Pulls the JSON object out of model output, tolerating code fences and surrounding prose. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object found in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}

function toComment(item: unknown): RawComment | null {
  if (!isRecord(item)) return null;

  const line = Number(item.line);
  const body = typeof item.body === "string" ? item.body.trim() : "";
  if (!Number.isInteger(line) || line <= 0 || body === "") return null;

  const confidence = Number(item.confidence);
  const severity = SEVERITIES.find((s) => s === item.severity) ?? "maintainability";

  return {
    line,
    body,
    severity,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
  };
}

/** Parses and validates a review response. Malformed individual comments are dropped, not fatal. */
export function parseReviewResponse(text: string): RawComment[] {
  const json = extractJson(text);
  if (!isRecord(json) || !Array.isArray(json.comments)) {
    throw new Error("Model output is missing a `comments` array");
  }
  return json.comments.map(toComment).filter((c): c is RawComment => c !== null);
}
