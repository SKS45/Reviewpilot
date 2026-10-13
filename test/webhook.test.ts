import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { handleWebhook } from "../src/github/webhook.js";
import type { ReviewJob } from "../src/review/types.js";

const secret = "whsec";

function payload(overrides: Record<string, unknown> = {}, pr: Record<string, unknown> = {}) {
  return {
    action: "opened",
    installation: { id: 99 },
    repository: { name: "api", owner: { login: "acme" } },
    pull_request: { number: 7, title: "Add login", draft: false, head: { sha: "abc123" }, ...pr },
    ...overrides,
  };
}

async function send(event: string, body: unknown, opts: { signWith?: string } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const signature = `sha256=${createHmac("sha256", opts.signWith ?? secret).update(raw).digest("hex")}`;
  const queued: ReviewJob[] = [];
  const response = await handleWebhook(
    { secret, rawBody: raw, headers: { "x-hub-signature-256": signature, "x-github-event": event } },
    async (job) => {
      queued.push(job);
    },
  );
  return { response, queued };
}

describe("handleWebhook", () => {
  it("queues a review for an opened pull request", async () => {
    const { response, queued } = await send("pull_request", payload());
    assert.equal(response.status, 202);
    assert.deepEqual(queued, [
      { installationId: 99, owner: "acme", repo: "api", pullNumber: 7, headSha: "abc123", title: "Add login" },
    ]);
  });

  it("queues on synchronize, reopened and ready_for_review", async () => {
    for (const action of ["synchronize", "reopened", "ready_for_review"]) {
      const { queued } = await send("pull_request", payload({ action }));
      assert.equal(queued.length, 1, action);
    }
  });

  it("ignores closed, labeled and other non-code actions", async () => {
    for (const action of ["closed", "labeled", "edited", "assigned"]) {
      const { response, queued } = await send("pull_request", payload({ action }));
      assert.equal(response.status, 202);
      assert.equal(queued.length, 0, action);
    }
  });

  it("ignores draft pull requests", async () => {
    const { queued } = await send("pull_request", payload({}, { draft: true }));
    assert.equal(queued.length, 0);
  });

  it("rejects a bad signature with 401 and queues nothing", async () => {
    const { response, queued } = await send("pull_request", payload(), { signWith: "wrong" });
    assert.equal(response.status, 401);
    assert.equal(queued.length, 0);
  });

  it("answers ping and ignores unrelated events", async () => {
    assert.equal((await send("ping", { zen: "Keep it logically awesome." })).response.status, 200);
    const other = await send("issues", { action: "opened" });
    assert.equal(other.response.status, 202);
    assert.equal(other.queued.length, 0);
  });

  it("ignores payloads without an installation or with missing fields", async () => {
    assert.equal((await send("pull_request", payload({ installation: undefined }))).queued.length, 0);
    assert.equal((await send("pull_request", { action: "opened" })).queued.length, 0);
  });

  it("returns 400 for a signed but non-JSON body", async () => {
    const raw = Buffer.from("not json");
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    const response = await handleWebhook(
      { secret, rawBody: raw, headers: { "x-hub-signature-256": signature, "x-github-event": "pull_request" } },
      async () => {},
    );
    assert.equal(response.status, 400);
  });
});
