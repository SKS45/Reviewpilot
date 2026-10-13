import type { LLMProvider } from "../llm/types.js";
import { log } from "../logger.js";
import { errorMessage } from "../util.js";
import { parsePatch, renderForPrompt } from "./diff.js";
import { isIgnoredPath } from "./ignore.js";
import { parseReviewResponse, type Severity } from "./parse.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import type { GitHubPort, ReviewComment, ReviewJob, ReviewLimits, ReviewResult } from "./types.js";

interface Candidate {
  path: string;
  line: number;
  severity: Severity;
  confidence: number;
  body: string;
}

export interface ReviewDeps {
  job: ReviewJob;
  github: GitHubPort;
  llm: LLMProvider;
  limits: ReviewLimits;
}

/**
 * Reviews one pull request: fetch files, ask the LLM about each patch, keep only comments that
 * land on real diff lines with enough confidence, and post them as a single review.
 *
 * Throws only when every attempted file failed, so the queue can retry the whole job.
 */
export async function runReview({ job, github, llm, limits }: ReviewDeps): Promise<ReviewResult> {
  const result: ReviewResult = {
    status: "nothing_to_review",
    filesReviewed: 0,
    filesFailed: 0,
    commentsPosted: 0,
    inputTokens: 0,
    outputTokens: 0,
  };

  const files = (await github.listPullFiles())
    .filter((f) => f.status !== "removed" && Boolean(f.patch) && !isIgnoredPath(f.filename))
    .slice(0, limits.maxFiles);

  const candidates: Candidate[] = [];
  let lastError: unknown;

  for (const file of files) {
    const patch = file.patch ?? "";
    if (patch.length > limits.maxPatchChars) {
      log.info("skipping oversized patch", { path: file.filename, chars: patch.length });
      continue;
    }

    const parsed = parsePatch(patch);
    if (parsed.addedLines.size === 0) continue; // deletions only

    try {
      const response = await llm.complete({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt({ title: job.title, path: file.filename, diff: renderForPrompt(parsed) }),
      });
      result.inputTokens += response.usage?.inputTokens ?? 0;
      result.outputTokens += response.usage?.outputTokens ?? 0;

      for (const comment of parseReviewResponse(response.text)) {
        if (comment.confidence < limits.minConfidence) continue;
        if (!parsed.commentableLines.has(comment.line)) continue; // GitHub rejects off-diff lines with a 422
        candidates.push({ path: file.filename, ...comment });
      }
      result.filesReviewed++;
    } catch (err) {
      result.filesFailed++;
      lastError = err;
      log.warn("file review failed", { path: file.filename, error: errorMessage(err) });
    }
  }

  if (result.filesReviewed === 0) {
    if (result.filesFailed > 0) throw lastError;
    return result;
  }

  const seen = new Set<string>();
  const selected = candidates
    .sort((a, b) => b.confidence - a.confidence)
    .filter((c) => {
      const key = `${c.path}:${c.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limits.maxComments)
    .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);

  if (selected.length === 0) {
    result.status = "no_findings";
    return result;
  }

  // A newer push makes these line numbers meaningless; its own job will review it.
  if ((await github.getHeadSha()) !== job.headSha) {
    result.status = "skipped_stale";
    return result;
  }

  const comments: ReviewComment[] = selected.map((c) => ({
    path: c.path,
    line: c.line,
    side: "RIGHT",
    body: `**${c.severity}** · ${c.body}`,
  }));

  const failedNote = result.filesFailed > 0 ? ` ${result.filesFailed} file(s) could not be reviewed.` : "";
  await github.postReview({
    headSha: job.headSha,
    body: `ReviewPilot reviewed ${result.filesReviewed} file(s) and left ${comments.length} comment(s).${failedNote}`,
    comments,
  });

  result.status = "posted";
  result.commentsPosted = comments.length;
  return result;
}
