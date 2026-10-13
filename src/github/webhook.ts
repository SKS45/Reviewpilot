import type { ReviewJob } from "../review/types.js";
import { toReviewJob } from "./events.js";
import { verifySignature } from "./signature.js";

export interface WebhookRequest {
  secret: string;
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface WebhookResponse {
  status: number;
  body: { ok: boolean; message: string };
}

const reply = (status: number, message: string): WebhookResponse => ({
  status,
  body: { ok: status < 400, message },
});

/** Framework-agnostic webhook logic: verify, filter, enqueue. The HTTP layer just calls this. */
export async function handleWebhook(
  req: WebhookRequest,
  enqueue: (job: ReviewJob) => Promise<void>,
): Promise<WebhookResponse> {
  const header = (name: string): string | undefined => {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  if (!verifySignature(req.secret, req.rawBody, header("x-hub-signature-256"))) {
    return reply(401, "invalid signature");
  }

  const event = header("x-github-event");
  if (event === "ping") return reply(200, "pong");
  if (event !== "pull_request") return reply(202, `ignored event: ${event ?? "unknown"}`);

  let payload: unknown;
  try {
    payload = JSON.parse(req.rawBody.toString("utf8"));
  } catch {
    return reply(400, "invalid JSON body");
  }

  const job = toReviewJob(payload);
  if (!job) return reply(202, "ignored pull_request event");

  await enqueue(job);
  return reply(202, `queued review for ${job.owner}/${job.repo}#${job.pullNumber}`);
}
