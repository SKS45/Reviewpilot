import type { ReviewJob } from "../review/types.js";
import { isRecord } from "../util.js";

const REVIEWABLE_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);

/** Turns a `pull_request` webhook payload into a review job, or null if it should be ignored. */
export function toReviewJob(payload: unknown): ReviewJob | null {
  if (!isRecord(payload)) return null;

  const { action, installation, repository, pull_request: pr } = payload;
  if (typeof action !== "string" || !REVIEWABLE_ACTIONS.has(action)) return null;
  if (!isRecord(installation) || typeof installation.id !== "number") return null;
  if (!isRecord(repository) || typeof repository.name !== "string") return null;
  if (!isRecord(pr) || typeof pr.number !== "number" || typeof pr.title !== "string") return null;

  const owner = repository.owner;
  const head = pr.head;
  if (!isRecord(owner) || typeof owner.login !== "string") return null;
  if (!isRecord(head) || typeof head.sha !== "string") return null;

  if (pr.draft === true) return null; // reviewed once it is marked ready_for_review

  return {
    installationId: installation.id,
    owner: owner.login,
    repo: repository.name,
    pullNumber: pr.number,
    headSha: head.sha,
    title: pr.title,
  };
}
