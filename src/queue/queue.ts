import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { ReviewJob } from "../review/types.js";

export const QUEUE_NAME = "pr-reviews";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export function createRedis(url: string): Redis {
  // BullMQ workers require this to be null so blocking commands are not aborted.
  return new Redis(url, { maxRetriesPerRequest: null });
}

/** One job per PR head commit: redelivered webhooks for the same SHA are deduplicated by BullMQ. */
export function reviewJobId(job: ReviewJob): string {
  return `${job.owner}/${job.repo}#${job.pullNumber}@${job.headSha}`;
}

export function createReviewQueue(connection: Redis): Queue<ReviewJob> {
  return new Queue<ReviewJob>(QUEUE_NAME, { connection });
}

export async function enqueueReview(queue: Queue<ReviewJob>, job: ReviewJob): Promise<void> {
  await queue.add("review", job, {
    jobId: reviewJobId(job),
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { age: SEVEN_DAYS_SECONDS },
    removeOnFail: { age: SEVEN_DAYS_SECONDS },
  });
}
