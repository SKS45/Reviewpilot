import { Worker } from "bullmq";
import { loadConfig } from "./config.js";
import { createGitHubApp, githubPortFor } from "./github/client.js";
import { createProvider } from "./llm/index.js";
import { log } from "./logger.js";
import { QUEUE_NAME, createRedis } from "./queue/queue.js";
import { runReview } from "./review/pipeline.js";
import type { ReviewJob, ReviewResult } from "./review/types.js";

const cfg = loadConfig();
const llm = createProvider(cfg);
const githubApp = createGitHubApp(cfg);
const connection = createRedis(cfg.REDIS_URL);

const limits = {
  maxFiles: cfg.MAX_FILES_PER_PR,
  maxPatchChars: cfg.MAX_PATCH_CHARS,
  maxComments: cfg.MAX_COMMENTS_PER_PR,
  minConfidence: cfg.MIN_CONFIDENCE,
};

const worker = new Worker<ReviewJob, ReviewResult>(
  QUEUE_NAME,
  async (job) => {
    const github = await githubPortFor(githubApp, job.data);
    const result = await runReview({ job: job.data, github, llm, limits });
    log.info("review finished", {
      pr: `${job.data.owner}/${job.data.repo}#${job.data.pullNumber}`,
      sha: job.data.headSha,
      provider: llm.name,
      ...result,
    });
    return result;
  },
  { connection, concurrency: cfg.WORKER_CONCURRENCY },
);

worker.on("failed", (job, err) => {
  log.error("review job failed", {
    jobId: job?.id,
    attempt: job?.attemptsMade,
    error: err.message,
  });
});

log.info("worker started", { provider: llm.name, concurrency: cfg.WORKER_CONCURRENCY });

async function shutdown(signal: string): Promise<void> {
  log.info("shutting down", { signal });
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
