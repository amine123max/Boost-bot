import { createHash } from "node:crypto";
import { redactText } from "../log.js";

export interface FileChange {
  key: string;
  name: string;
  operation: "create" | "update";
  added?: number;
  removed?: number;
  diff?: { kind: 'context' | 'add' | 'remove'; text: string }[];
}

function lines(value: string) {
  return (value.endsWith("\n") ? value.slice(0, -1) : value).split(/\r?\n/);
}

/** Count only observed changes, discarding unchanged context around each hunk. */
function countHunk(oldText: string | null, newText: string): [number, number] | undefined {
  if ((oldText?.length ?? 0) + newText.length > 100_000) return;
  const before = oldText ? lines(oldText) : [], after = newText ? lines(newText) : [];
  let start = 0, endA = before.length, endB = after.length;
  while (start < endA && start < endB && before[start] === after[start]) start++;
  while (endA > start && endB > start && before[endA - 1] === after[endB - 1]) { endA--; endB--; }
  if ((endA - start) * (endB - start) > 65_536) return;
  // A hunk can contain several changed lines separated by unchanged lines.
  const row = new Uint32Array(endB - start + 1);
  for (let a = start; a < endA; a++) {
    let diagonal = 0;
    for (let b = start; b < endB; b++) {
      const index = b - start + 1, previous = row[index];
      row[index] = before[a] === after[b] ? diagonal + 1 : Math.max(row[index], row[index - 1]);
      diagonal = previous;
    }
  }
  const shared = row.at(-1)!;
  return [endB - start - shared, endA - start - shared];
}

function previewHunk(oldText: string | null, newText: string): NonNullable<FileChange['diff']> | undefined {
  const a = oldText ? lines(oldText) : [], b = newText ? lines(newText) : [];
  if (a.length + b.length > 180 || a.length * b.length > 16_384) return;
  const matrix = Array.from({length:a.length+1}, () => new Uint16Array(b.length+1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    matrix[i][j] = a[i] === b[j] ? 1 + matrix[i+1][j+1] : Math.max(matrix[i+1][j], matrix[i][j+1]);
  }
  const result: NonNullable<FileChange['diff']> = [];
  for (let i = 0, j = 0; i < a.length || j < b.length;) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({kind:'context',text:redactText(a[i]).slice(0,1000)}); i++; j++;
    } else if (i < a.length && (j === b.length || matrix[i+1][j] >= matrix[i][j+1])) {
      result.push({kind:'remove',text:redactText(a[i++]).slice(0,1000)});
    } else result.push({kind:'add',text:redactText(b[j++]).slice(0,1000)});
  }
  return result;
}

/** DSH's successful file tool result supplies applied metadata. Raw diffs stay on the host. */
export function fileChange(tool: string, value: unknown, captureDiff = false): FileChange | undefined {
  if (tool !== "edit" && tool !== "write" || !value || typeof value !== "object") return;
  const { path, operation, diffs } = value as { path?: unknown; operation?: unknown; diffs?: unknown };
  if (typeof path !== "string" || !path || path.length > 4096 || !Array.isArray(diffs)) return;
  const create = operation === "create";
  if (!create && !diffs.length) return;
  const name = redactText(path.split(/[\\/]/).pop() || "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
  if (!name) return;
  const result: FileChange = { key: createHash("sha256").update(path).digest("hex").slice(0, 24), name, operation: create ? "create" : "update" };
  if (!diffs.length || diffs.length > 32) return result;
  let added = 0, removed = 0;
  let size = 0;
  const diff: NonNullable<FileChange['diff']> = [];
  const previews = captureDiff && !/(?:^\.env|secret|credential|password|token|\.(?:pem|key|pfx|p12)$)/i.test(name);
  for (const hunk of diffs) {
    if (!hunk || typeof hunk.newText !== "string" || (hunk.oldText !== null && typeof hunk.oldText !== "string")) return result;
    size += hunk.newText.length + (hunk.oldText?.length ?? 0);
    if (size > 200_000) return result;
    const counts = countHunk(hunk.oldText, hunk.newText);
    if (!counts) return result;
    added += counts[0]; removed += counts[1];
    if (previews && diff.length < 100 && size < 20_000) {
      const rows = previewHunk(hunk.oldText, hunk.newText);
      if (rows) diff.push(...rows.slice(0, 100 - diff.length));
    }
  }
  return { ...result, added, removed, ...(diff.length ? {diff} : {}) };
}
