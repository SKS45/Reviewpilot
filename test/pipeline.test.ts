import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LLMProvider, LLMRequest } from "../src/llm/types.js";
import { runReview } from "../src/review/pipeline.js";
import type { GitHubPort, PullFile, ReviewComment, ReviewJob, ReviewLimits } from "../src/review/types.js";

// New-file lines: 1 context, 2 added, 3 context, 4 added
const patch = [
  "@@ -1,2 +1,4 @@",
  " const a = 1;",
  "+const b = query(userInput);",
  " export { a };",
  "+export { b };",
].join("\n");

const job: ReviewJob = { installationId: 1, owner: "acme", repo: "api", pullNumber: 7, headSha: "sha1", title: "Add b" };
const limits: ReviewLimits = { maxFiles: 10, maxPatchChars: 10_000, maxComments: 5, minConfidence: 0.6 };

interface Posted {
  headSha: string;
  body: string;
  comments: ReviewComment[];
}

function fakeGitHub(files: PullFile[], currentSha = "sha1") {
  const posted: Posted[] = [];
  const github: GitHubPort = {
    listPullFiles: async () => files,
    getHeadSha: async () => currentSha,
    postReview: async (review) => {
      posted.push(review);
    },
  };
  return { github, posted };
}

function fakeLLM(respond: (req: LLMRequest) => string | Error) {
  const calls: LLMRequest[] = [];
  const llm: LLMProvider = {
    name: "fake",
    async complete(req) {
      calls.push(req);
      const out = respond(req);
      if (out instanceof Error) throw out;
      return { text: out, usage: { inputTokens: 100, outputTokens: 20 } };
    },
  };
  return { llm, calls };
}

const reply = (...comments: object[]) => JSON.stringify({ comments });
const file = (filename: string, extra: Partial<PullFile> = {}): PullFile => ({ filename, status: "modified", patch, ...extra });

describe("runReview", () => {
  it("posts only valid, confident, de-duplicated comments, highest confidence first on ties", async () => {
    const { github, posted } = fakeGitHub([file("src/db.ts")]);
    const { llm } = fakeLLM(() =>
      reply(
        { line: 2, severity: "security", confidence: 0.9, body: "SQL injection via userInput." },
        { line: 2, severity: "bug", confidence: 0.7, body: "Duplicate on same line." },
        { line: 99, severity: "bug", confidence: 0.95, body: "Not in the diff." },
        { line: 3, severity: "bug", confidence: 0.2, body: "Low confidence." },
      ),
    );

    const result = await runReview({ job, github, llm, limits });

    assert.equal(result.status, "posted");
    assert.equal(result.commentsPosted, 1);
    assert.equal(posted.length, 1);
    assert.equal(posted[0]?.headSha, "sha1");
    assert.deepEqual(posted[0]?.comments, [
      { path: "src/db.ts", line: 2, side: "RIGHT", body: "**security** · SQL injection via userInput." },
    ]);
    assert.equal(result.inputTokens, 100);
    assert.equal(result.outputTokens, 20);
  });

  it("caps the number of comments, keeping the most confident, ordered by file and line", async () => {
    const { github, posted } = fakeGitHub([file("src/a.ts")]);
    const { llm } = fakeLLM(() =>
      reply(
        { line: 4, severity: "bug", confidence: 0.7, body: "second" },
        { line: 2, severity: "bug", confidence: 0.95, body: "first" },
        { line: 3, severity: "bug", confidence: 0.65, body: "dropped" },
      ),
    );

    await runReview({ job, github, llm, limits: { ...limits, maxComments: 2 } });

    assert.deepEqual(
      posted[0]?.comments.map((c) => c.line),
      [2, 4],
    );
  });

  it("does not call the LLM for lockfiles, removed files, patchless files or deletions-only patches", async () => {
    const { github, posted } = fakeGitHub([
      file("package-lock.json"),
      file("src/gone.ts", { status: "removed" }),
      file("assets/blob.bin", { patch: undefined }),
      file("src/only-deletes.ts", { patch: "@@ -1,2 +1 @@\n keep\n-remove" }),
    ]);
    const { llm, calls } = fakeLLM(() => reply());

    const result = await runReview({ job, github, llm, limits });

    assert.equal(calls.length, 0);
    assert.equal(result.status, "nothing_to_review");
    assert.equal(posted.length, 0);
  });

  it("skips oversized patches", async () => {
    const { github } = fakeGitHub([file("src/huge.ts")]);
    const { llm, calls } = fakeLLM(() => reply());
    const result = await runReview({ job, github, llm, limits: { ...limits, maxPatchChars: 10 } });
    assert.equal(calls.length, 0);
    assert.equal(result.status, "nothing_to_review");
  });

  it("posts nothing when the model finds nothing", async () => {
    const { github, posted } = fakeGitHub([file("src/ok.ts")]);
    const { llm } = fakeLLM(() => reply());
    const result = await runReview({ job, github, llm, limits });
    assert.equal(result.status, "no_findings");
    assert.equal(result.filesReviewed, 1);
    assert.equal(posted.length, 0);
  });

  it("skips posting when a newer commit has been pushed", async () => {
    const { github, posted } = fakeGitHub([file("src/db.ts")], "newer-sha");
    const { llm } = fakeLLM(() => reply({ line: 2, severity: "bug", confidence: 0.9, body: "Real issue." }));
    const result = await runReview({ job, github, llm, limits });
    assert.equal(result.status, "skipped_stale");
    assert.equal(posted.length, 0);
  });

  it("throws when every file fails so the queue can retry", async () => {
    const { github, posted } = fakeGitHub([file("src/a.ts"), file("src/b.ts")]);
    const { llm } = fakeLLM(() => new Error("rate limited"));
    await assert.rejects(runReview({ job, github, llm, limits }), /rate limited/);
    assert.equal(posted.length, 0);
  });

  it("still posts when only some files fail, and says so", async () => {
    const { github, posted } = fakeGitHub([file("src/bad.ts"), file("src/good.ts")]);
    const { llm } = fakeLLM((req) =>
      req.user.includes("src/bad.ts")
        ? new Error("model hiccup")
        : reply({ line: 2, severity: "bug", confidence: 0.9, body: "Real issue." }),
    );

    const result = await runReview({ job, github, llm, limits });

    assert.equal(result.status, "posted");
    assert.equal(result.filesFailed, 1);
    assert.equal(result.filesReviewed, 1);
    assert.match(posted[0]?.body ?? "", /1 file\(s\) could not be reviewed/);
  });

  it("counts unparseable model output as a failed file", async () => {
    const { github } = fakeGitHub([file("src/a.ts")]);
    const { llm } = fakeLLM(() => "I could not review this.");
    await assert.rejects(runReview({ job, github, llm, limits }), /No JSON object/);
  });

  it("puts the PR title, file path and numbered diff in the prompt", async () => {
    const { github } = fakeGitHub([file("src/db.ts")]);
    const { llm, calls } = fakeLLM(() => reply());
    await runReview({ job, github, llm, limits });
    const user = calls[0]?.user ?? "";
    assert.match(user, /Add b/);
    assert.match(user, /src\/db\.ts/);
    assert.match(user, /\s2 \+ const b = query\(userInput\);/);
  });
});
