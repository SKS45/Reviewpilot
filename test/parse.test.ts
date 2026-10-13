import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractJson, parseReviewResponse } from "../src/review/parse.js";

const comment = { line: 12, severity: "bug", confidence: 0.9, body: "Null deref when user is missing." };

describe("parseReviewResponse", () => {
  it("parses plain JSON", () => {
    assert.deepEqual(parseReviewResponse(JSON.stringify({ comments: [comment] })), [comment]);
  });

  it("parses JSON wrapped in a code fence with prose around it", () => {
    const text = `Here is my review:\n\`\`\`json\n${JSON.stringify({ comments: [comment] })}\n\`\`\`\nHope that helps.`;
    assert.equal(parseReviewResponse(text).length, 1);
  });

  it("parses JSON surrounded by prose without a fence", () => {
    const text = `Sure! ${JSON.stringify({ comments: [comment] })} Let me know.`;
    assert.equal(parseReviewResponse(text).length, 1);
  });

  it("returns an empty list when there is nothing to flag", () => {
    assert.deepEqual(parseReviewResponse('{"comments":[]}'), []);
  });

  it("coerces numeric strings, clamps confidence, and defaults unknown severity", () => {
    const [parsed] = parseReviewResponse(
      JSON.stringify({ comments: [{ line: "7", severity: "nitpick", confidence: 4, body: "  trim me  " }] }),
    );
    assert.deepEqual(parsed, { line: 7, severity: "maintainability", confidence: 1, body: "trim me" });
  });

  it("defaults a missing confidence to 0.5", () => {
    const [parsed] = parseReviewResponse(JSON.stringify({ comments: [{ line: 3, body: "x" }] }));
    assert.equal(parsed?.confidence, 0.5);
  });

  it("drops malformed comments but keeps valid ones", () => {
    const text = JSON.stringify({
      comments: [comment, { line: 0, body: "bad line" }, { line: 5, body: "" }, "nope", null, { body: "no line" }],
    });
    assert.deepEqual(parseReviewResponse(text), [comment]);
  });

  it("throws when there is no JSON or no comments array", () => {
    assert.throws(() => parseReviewResponse("I found no issues."), /No JSON object/);
    assert.throws(() => parseReviewResponse('{"result":"ok"}'), /comments/);
    assert.throws(() => extractJson("{ not json }"));
  });
});
