import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePatch, renderForPrompt } from "../src/review/diff.js";
import { isIgnoredPath } from "../src/review/ignore.js";

const patch = [
  "@@ -1,4 +1,5 @@",
  ' import a from "a";',
  "-const x = 1;",
  "+const x = 2;",
  "+const y = 3;",
  " export { x };",
  "@@ -20,3 +21,4 @@ function foo() {",
  "   return 1;",
  '+  console.log("hi");',
  " }",
].join("\n");

describe("parsePatch", () => {
  const parsed = parsePatch(patch);

  it("maps added lines to new-file line numbers across hunks", () => {
    assert.deepEqual([...parsed.addedLines].sort((a, b) => a - b), [2, 3, 22]);
  });

  it("treats context and added lines as commentable, removed lines as not", () => {
    assert.deepEqual([...parsed.commentableLines].sort((a, b) => a - b), [1, 2, 3, 4, 21, 22, 23]);
  });

  it("keeps removed lines without a new-side number", () => {
    const removed = parsed.lines.filter((l) => l.kind === "remove");
    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.newLine, null);
  });

  it("ignores the 'No newline at end of file' marker", () => {
    const withMarker = parsePatch(["@@ -1 +1 @@", "-old", "+new", "\\ No newline at end of file"].join("\n"));
    assert.deepEqual([...withMarker.addedLines], [1]);
    assert.equal(withMarker.lines.length, 2);
  });

  it("handles blank context lines and a trailing newline", () => {
    const blank = parsePatch("@@ -1,3 +1,3 @@\n a\n \n+b\n");
    assert.deepEqual([...blank.commentableLines].sort((a, b) => a - b), [1, 2, 3]);
    assert.deepEqual([...blank.addedLines], [3]);
  });

  it("returns nothing for an empty patch", () => {
    const empty = parsePatch("");
    assert.equal(empty.lines.length, 0);
    assert.equal(empty.addedLines.size, 0);
  });
});

describe("renderForPrompt", () => {
  const rendered = renderForPrompt(parsePatch(patch));

  it("shows new-file line numbers with +/- markers", () => {
    assert.ok(rendered.includes("   2 + const x = 2;"));
    assert.ok(rendered.includes("     - const x = 1;"));
    assert.ok(rendered.includes("   1   import a from"));
  });

  it("marks the gap between hunks", () => {
    const rows = rendered.split("\n");
    const gap = rows.indexOf("     ...");
    assert.ok(gap > 0);
    assert.ok(rows[gap - 1]?.startsWith("   4"));
    assert.ok(rows[gap + 1]?.startsWith("  21"));
  });
});

describe("isIgnoredPath", () => {
  it("skips lockfiles, build output, minified and binary files", () => {
    for (const path of [
      "package-lock.json",
      "web/pnpm-lock.yaml",
      "node_modules/x/index.js",
      "app/dist/bundle.js",
      "static/app.min.js",
      "logo.PNG",
      "go.sum",
    ]) {
      assert.equal(isIgnoredPath(path), true, path);
    }
  });

  it("keeps real source files", () => {
    for (const path of ["src/index.ts", "lib/distance.ts", "README.md", "src/build-utils.ts"]) {
      assert.equal(isIgnoredPath(path), false, path);
    }
  });

  it("supports extra patterns", () => {
    assert.equal(isIgnoredPath("src/generated/api.ts", [/generated\//]), true);
  });
});
