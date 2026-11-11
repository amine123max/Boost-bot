/**
 * 头像角色在几处各有一份：界面（avatar.js）、精灵图、颜色、样式、服务端校验、文案。加角色时漏一处，这里会拦下。
 * 另外守住两条容易被加角色破坏的约定：老机器人的头像不能变，官网只用六个基础角色。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOT_AVATARS, normalizeSettings } from "../src/agent/settings.js";
// @ts-expect-error Browser i18n is an unbundled JS module.
import * as ui from "../ui/lib/i18n.js";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const src = read("ui/components/avatar.js");
const block = (name: string) => {
  const m = src.match(new RegExp(`export const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  if (!m) throw new Error(`avatar.js 里没有 ${name}`);
  return m[1];
};
const keysOf = (b: string) => [...b.matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1]);
const base = keysOf(block("BOT_CHARS"));
const experts = keysOf(block("EXPERT_CHARS"));

describe("头像角色", () => {
  it("基础 6 个，专家 12 个，服务端认的和界面一样", () => {
    expect(base).toEqual(["blue", "yellow", "green", "red", "purple", "orange"]);
    expect(experts).toHaveLength(12);
    expect([...BOT_AVATARS]).toEqual([...base, ...experts]);
    for (const k of experts) expect(normalizeSettings({ avatar: k }).avatar).toBe(k);
  });

  it("每个角色都有精灵图、颜色、样式和文案", () => {
    const tokens = read("ui/design/tokens/primitives.css");
    const css = read("ui/design/components/avatar.css");
    const zh = read("ui/locales/zh-CN/avatar.js");
    for (const k of [...base, ...experts]) {
      expect(fs.existsSync(path.join(process.cwd(), `ui/design/bots/${k}.webp`)), `${k}.webp`).toBe(true);
      expect(tokens).toContain(`--bot-${k}-eye:`);
      expect(tokens).toContain(`--bot-${k}-glow:`);
      expect(zh).toMatch(new RegExp(`\\b${k}: \\{ name:`));
    }
    for (const k of experts) {
      expect(css).toContain(`.bot-face[data-char="${k}"] { --bf-eye: var(--bot-${k}-eye);`);
      expect(zh).toMatch(new RegExp(`\\b${k}: \\{ name: "[^"]+", field: "[^"]+"`));
    }
  });

  it("专家的名字、领域、介绍和分组标题，五种语言都取得到", () => {
    for (const lang of ui.LANGS) {
      ui.setLangPref(lang);
      expect(ui.t("avatar.groups.expert"), lang).not.toBe("avatar.groups.expert");
      for (const k of experts)
        for (const f of ["name", "field", "about"]) expect(ui.t(`avatar.chars.${k}.${f}`), `${lang} ${k}.${f}`).not.toBe(`avatar.chars.${k}.${f}`);
    }
    ui.setLangPref("system");
  });

  it("没选过头像的机器人只在基础角色里挑：加角色不能让老机器人换头像", () => {
    expect(src).toContain("BASE_KEYS[hash(String(bot.id || bot.name || \"?\")) % BASE_KEYS.length]");
  });

  it("官网比对的几何还是六个基础角色，只同步它们的精灵图", () => {
    const nums = block("BOT_CHARS").replace(/(name|role|pick): "[^"]*",?/g, "").match(/-?\d+(?:\.\d+)?/g) ?? [];
    const hash = crypto.createHash("sha256").update(nums.join(",")).digest("hex").slice(0, 16);
    expect(read("site/src/lib/bots.ts")).toContain(`BOT_CHARS_HASH = "${hash}"`);
    expect(read("site/scripts/sync-from-app.ts")).toContain("siteChars.has(path.parse(f).name)");
  });
});
