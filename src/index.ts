import express from "express";
import { loadConfig } from "./config.js";
import { handleWebhook } from "./github/webhook.js";
import { log } from "./logger.js";
import { createRedis, createReviewQueue, enqueueReview } from "./queue/queue.js";
import { errorMessage } from "./util.js";

const cfg = loadConfig();
const redis = createRedis(cfg.REDIS_URL);
const queue = createReviewQueue(redis);

const app = express();

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// The raw body is required: the signature is computed over the exact bytes GitHub sent.
app.post("/webhook", express.raw({ type: "application/json", limit: "5mb" }), async (req, res) => {
  if (!Buffer.isBuffer(req.body)) {
    res.status(415).json({ ok: false, message: "webhook content type must be application/json" });
    return;
  }

  try {
    const result = await handleWebhook(
      { secret: cfg.GITHUB_WEBHOOK_SECRET, rawBody: req.body, headers: req.headers },
      (job) => enqueueReview(queue, job),
    );
    res.status(result.status).json(result.body);
  } catch (err) {
    log.error("webhook handler failed", { error: errorMessage(err) });
    res.status(500).json({ ok: false, message: "internal error" });
  }
});

const server = app.listen(cfg.PORT, () => {
  log.info("webhook server listening", { port: cfg.PORT });
});

async function shutdown(signal: string): Promise<void> {
  log.info("shutting down", { signal });
  server.close();
  await queue.close();
  await redis.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
