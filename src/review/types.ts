export interface ReviewJob {
  installationId: number;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  title: string;
}

export interface PullFile {
  filename: string;
  status: string;
  patch?: string | undefined;
}

export interface ReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

/** The only GitHub surface the review pipeline needs. Keeps the pipeline testable without network. */
export interface GitHubPort {
  listPullFiles(): Promise<PullFile[]>;
  getHeadSha(): Promise<string>;
  postReview(args: { headSha: string; body: string; comments: ReviewComment[] }): Promise<void>;
}

export interface ReviewLimits {
  maxFiles: number;
  maxPatchChars: number;
  maxComments: number;
  minConfidence: number;
}

export type ReviewStatus = "posted" | "no_findings" | "skipped_stale" | "nothing_to_review";

export interface ReviewResult {
  status: ReviewStatus;
  filesReviewed: number;
  filesFailed: number;
  commentsPosted: number;
  inputTokens: number;
  outputTokens: number;
}
