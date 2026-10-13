export type DiffLineKind = "add" | "context" | "remove";

export interface DiffLine {
  kind: DiffLineKind;
  /** Line number in the new (RIGHT) side of the file; null for removed lines. */
  newLine: number | null;
  text: string;
}

export interface ParsedPatch {
  lines: DiffLine[];
  /** Every new-side line visible in the diff. GitHub only accepts inline comments on these. */
  commentableLines: Set<number>;
  addedLines: Set<number>;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Parses the per-file `patch` string returned by GitHub's "list pull request files" endpoint. */
export function parsePatch(patch: string): ParsedPatch {
  const rows = patch.split("\n");
  if (rows.at(-1) === "") rows.pop();

  const lines: DiffLine[] = [];
  const commentableLines = new Set<number>();
  const addedLines = new Set<number>();
  let newLine = 0;
  let inHunk = false;

  for (const row of rows) {
    const hunk = HUNK_HEADER.exec(row);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || row.startsWith("\\")) continue; // "\ No newline at end of file"

    const marker = row[0];
    const text = row.slice(1);

    if (marker === "+") {
      lines.push({ kind: "add", newLine, text });
      commentableLines.add(newLine);
      addedLines.add(newLine);
      newLine++;
    } else if (marker === "-") {
      lines.push({ kind: "remove", newLine: null, text });
    } else {
      lines.push({ kind: "context", newLine, text: marker === " " ? text : row });
      commentableLines.add(newLine);
      newLine++;
    }
  }

  return { lines, commentableLines, addedLines };
}

/** Renders a parsed patch as `<new line number> <+|-| > <code>` rows, with `...` between hunks. */
export function renderForPrompt(parsed: ParsedPatch): string {
  const out: string[] = [];
  let previous: number | null = null;

  for (const line of parsed.lines) {
    if (line.newLine !== null) {
      if (previous !== null && line.newLine !== previous + 1) out.push("     ...");
      previous = line.newLine;
    }
    const number = line.newLine === null ? "    " : String(line.newLine).padStart(4);
    const sign = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
    out.push(`${number} ${sign} ${line.text}`);
  }

  return out.join("\n");
}
