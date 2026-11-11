import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";
async function moduleAt(name) {
  const source = await fs.readFile(
    new URL("../src/lib/" + name + ".ts", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );
}
const {
  normalizeTypography,
  resolveTypographyPreferences,
  typographyDefaults,
  typographyVariables,
} = await moduleAt("ui-typography");
const { softSwitchFrames } = await moduleAt("soft-switch-motion");
const { themeCircle, isDarkAppearance, applyThemeWithTransition } =
  await moduleAt("theme-transition");
test("typography defaults use the system-sized 13px text with bounded adjustments", () => {
  assert.deepEqual(normalizeTypography({}), {
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: 0,
  });
  assert.deepEqual(typographyDefaults, normalizeTypography({}));
  assert.deepEqual(
    resolveTypographyPreferences(
      { fontSize: 15, fontWeight: 400, letterSpacing: 0.5 },
      1,
    ),
    { fontSize: 13, fontWeight: 400, letterSpacing: 0 },
  );
  assert.deepEqual(
    resolveTypographyPreferences(
      { fontSize: 14, fontWeight: 400, letterSpacing: 0 },
      2,
    ),
    { fontSize: 13, fontWeight: 400, letterSpacing: 0 },
  );
  assert.equal(
    resolveTypographyPreferences(
      { fontSize: 15, fontWeight: 500, letterSpacing: 0.5 },
      1,
    ).fontSize,
    15,
  );
  assert.deepEqual(
    normalizeTypography({ fontSize: 100, fontWeight: 900, letterSpacing: -10 }),
    { fontSize: 16, fontWeight: 400, letterSpacing: -0.3 },
  );
  const settings = typographyVariables({
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: 0,
  });
  assert.equal(settings["--font-scale"], String(13 / 14));
  assert.equal(settings["--data-font-scale"], String(13 / 15));
  assert.equal(settings["--ui-letter-spacing"], "0px");
  assert.equal(settings["--ui-heading-weight"], "600");
  const root = typographyVariables({ fontSize: NaN, letterSpacing: Infinity });
  assert.ok(!Object.values(root).some((value) => /NaN|Infinity/.test(value)));
});
test("soft tab movement never overshoots its target in either direction", () => {
  for (const [from, to] of [
    [0, 200],
    [200, 0],
    [25, 25],
  ]) {
    const frames = softSwitchFrames(from, to, 70, 100);
    let previous = from;
    for (const frame of frames) {
      const x = Number(frame.transform.match(/translateX\(([-\d.]+)/)[1]);
      assert.ok(
        x >= Math.min(from, to) - 1e-8 && x <= Math.max(from, to) + 1e-8,
      );
      assert.ok(to >= from ? x >= previous - 1e-8 : x <= previous + 1e-8);
      assert.ok(
        parseFloat(frame.width) >= 70 && parseFloat(frame.width) <= 100,
      );
      previous = x;
    }
    assert.ok(Math.abs(previous - to) < 1e-8);
    assert.equal(frames[0].offset, 0);
    assert.equal(frames.at(-1).offset, 1);
  }
});
test("theme reveal radius covers the full viewport from the selected origin", () => {
  for (const origin of [
    { x: 10, y: 30 },
    { x: 800, y: 600 },
    { x: -20, y: 2000 },
  ]) {
    const c = themeCircle(origin, 1100, 860);
    for (const [x, y] of [
      [0, 0],
      [1100, 0],
      [0, 860],
      [1100, 860],
    ])
      assert.ok(Math.hypot(c.x - x, c.y - y) <= c.radius);
  }
  assert.equal(isDarkAppearance("dark", false), true);
  assert.equal(isDarkAppearance("system", true), true);
  assert.equal(isDarkAppearance("light", true), false);
});

async function themeEnvironment(root, start, reduced, action) {
  const keys = ["document", "matchMedia", "innerWidth", "innerHeight"];
  const originals = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  Object.assign(globalThis, {
    document: { documentElement: root, startViewTransition: start },
    matchMedia: (query) => ({
      matches: query.includes("reduced-motion") && reduced,
    }),
    innerWidth: 1100,
    innerHeight: 860,
  });
  try {
    await action();
  } finally {
    for (const key of keys) {
      const descriptor = originals.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
test("theme changes apply once when animations are unavailable or reduced", async () => {
  for (const reduced of [false, true]) {
    let applied = 0;
    const root = { dataset: { theme: "dark" } };
    await themeEnvironment(
      root,
      reduced
        ? () => {
            throw new Error("animation must be skipped");
          }
        : undefined,
      reduced,
      async () => {
        await applyThemeWithTransition("light", () => {
          applied++;
          root.dataset.theme = "light";
        });
      },
    );
    assert.equal(applied, 1);
    assert.equal(root.dataset.theme, "light");
  }
});
test("light expands and dark contracts with transition state cleaned up", async () => {
  for (const dark of [false, true]) {
    const classes = new Set();
    let animation,
      applied = 0;
    const root = {
      dataset: { theme: dark ? "light" : "dark" },
      classList: {
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
      },
      animate: (frames, options) => {
        animation = { frames, options };
        return { finished: Promise.resolve() };
      },
    };
    await themeEnvironment(
      root,
      (callback) => ({
        ready: Promise.resolve(callback()),
        finished: Promise.resolve(),
        skipTransition: () => {},
      }),
      false,
      async () => {
        await applyThemeWithTransition(
          dark ? "dark" : "light",
          () => {
            applied++;
            root.dataset.theme = dark ? "dark" : "light";
          },
          { x: 50, y: 80 },
        );
      },
    );
    assert.equal(applied, 1);
    assert.equal(classes.size, 0);
    assert.equal(root.dataset.themeTransition, undefined);
    assert.equal(animation.options.duration, 640);
    assert.equal(
      animation.options.pseudoElement,
      dark ? "::view-transition-old(root)" : "::view-transition-new(root)",
    );
    assert.equal(
      animation.frames.clipPath[dark ? 1 : 0],
      "circle(0px at 50px 80px)",
    );
  }
});
test("failed theme snapshot does not apply settings twice or leave transition classes", async () => {
  let applied = 0,
    skipped = 0;
  const classes = new Set();
  const root = {
    dataset: { theme: "dark" },
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
    },
  };
  await themeEnvironment(
    root,
    (callback) => {
      callback();
      return {
        ready: Promise.reject(new Error("snapshot unavailable")),
        finished: Promise.resolve(),
        skipTransition: () => skipped++,
      };
    },
    false,
    async () => {
      await applyThemeWithTransition("light", () => {
        applied++;
        root.dataset.theme = "light";
      });
    },
  );
  assert.equal(applied, 1);
  assert.equal(skipped, 1);
  assert.equal(classes.size, 0);
});
