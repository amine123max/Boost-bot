import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";

const source = await fs.readFile(
  new URL("../src/lib/account-reset-credits.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const { readResetCreditExpiries } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("reset credits show only available Codex grants, earliest expiry first", () => {
  const early = "2026-12-01T04:30:09+08:00";
  const late = "2026-12-02T06:09:00+08:00";
  assert.deepEqual(
    readResetCreditExpiries(
      JSON.stringify({
        rate_limit_reset_credits: {
          credits: [
            {
              id: "private",
              expires_at: late,
              status: "available",
              reset_type: "codex_rate_limits",
            },
            { expires_at: early },
            { expires_at: early, status: "consumed" },
            { expires_at: early, status: "expired" },
            { expires_at: early, reset_type: "other" },
            null,
            [],
            "invalid",
            { expires_at: "invalid" },
            {},
          ],
        },
      }),
    ),
    [Date.parse(early), Date.parse(late), null, null],
  );
});

test("reset credit metadata supports camelCase and treats missing or corrupt details as unknown", () => {
  const date = "2026-12-01T00:00:00Z";
  assert.deepEqual(
    readResetCreditExpiries(
      JSON.stringify({
        rateLimitResetCredits: {
          credits: [
            {
              expiresAt: date,
              resetType: " CODEX_RATE_LIMITS ",
              status: " AVAILABLE ",
            },
          ],
        },
      }),
    ),
    [Date.parse(date)],
  );
  for (const raw of [
    null,
    undefined,
    "",
    "{",
    "null",
    "[]",
    "{}",
    '{"rate_limit_reset_credits":{"available_count":2}}',
    '{"rate_limit_reset_credits":{"credits":{}}}',
    '{"rate_limit_reset_credits":{"credits":[]}}',
  ]) {
    assert.deepEqual(readResetCreditExpiries(raw), []);
  }
});
