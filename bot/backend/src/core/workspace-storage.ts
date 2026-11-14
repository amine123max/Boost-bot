import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { saveConfigFile, type AppConfig } from "../config.js";

const same = (a: string, b: string) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
const within = (root: string, child: string) => {
  const rel = path.relative(root, child);
  return !rel || (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel));
};

/** One resolver for execution, catalog apps, media, collaboration and file delivery. */
export function workspaceRoot(config: Pick<AppConfig, "dataDir" | "workspaceRoot">): string {
  return config.workspaceRoot || path.join(config.dataDir, "workspaces");
}

export class WorkspaceStorage {
  private parent: string;
  private error = "";
  constructor(private config: AppConfig) {
    this.parent = config.workspaceParent || "";
  }

  private destination(parent: string): string {
    if (!parent.trim()) return workspaceRoot(this.config);
    if (!path.isAbsolute(parent) || parent.includes("\0")) throw new Error("请选择运行 Boost 的电脑上的绝对文件夹路径");
    const base = path.resolve(parent.trim());
    const boost = path.basename(base).toLowerCase() === "boost" ? base : path.join(base, "Boost");
    // Separate users/workspaces sharing the same selected drive or folder.
    const data = fs.existsSync(this.config.dataDir) ? fs.realpathSync(this.config.dataDir) : path.resolve(this.config.dataDir);
    const identity = this.config.workspaceIdentity || data;
    const scope = createHash("sha256").update(process.platform === "win32" ? identity.toLowerCase() : identity).digest("hex").slice(0, 16);
    const target = path.join(boost, "bots", scope, "workspaces");
    if (within(data, target)) throw new Error("自定义沙箱不能放入当前内部数据目录，请选择其他文件夹");
    const source = workspaceRoot(this.config);
    if (!same(target, source) && (within(source, target) || within(target, source))) throw new Error("新旧沙箱目录不能互相包含");
    // Existing ancestors must not redirect into internal data or another workspace.
    let ancestor = target;
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const real = fs.realpathSync(ancestor);
    const resolved = path.resolve(real, path.relative(ancestor, target));
    if (within(data, resolved) || (!same(resolved, source) && within(source, resolved))) throw new Error("所选目录通过链接指向内部数据或现有沙箱");
    return target;
  }

  view() {
    let pendingRoot = workspaceRoot(this.config);
    try { pendingRoot = this.destination(this.parent); } catch { /* startup error is shown below */ }
    return { parent: this.parent, root: workspaceRoot(this.config), pendingRoot, restartRequired: !same(pendingRoot, workspaceRoot(this.config)), error: this.error };
  }

  validate(parent: string): void {
    const value = parent.trim();
    const target = this.destination(value);
    if (!same(target, workspaceRoot(this.config)) && fs.existsSync(target) &&
      (!fs.existsSync(workspaceRoot(this.config)) || !same(fs.realpathSync(target), fs.realpathSync(workspaceRoot(this.config)))))
      throw new Error("目标沙箱目录已存在，请选择未使用的文件夹，以免覆盖文件");
  }

  schedule(parent: string) {
    this.validate(parent);
    const value = parent.trim();
    saveConfigFile(this.config.dataDir, file => { file.workspaceParent = value; });
    this.parent = value;
    this.error = "";
    return this.view();
  }

  /** Called after the data-directory lock, before channels, agents or schedulers start. */
  activate(): void {
    let source = workspaceRoot(this.config), target = source;
    let created = false, moved = false, linked = false;
    // Fixed sibling name permits recovery after interruption before alias creation.
    const staging = source + ".boost-moving";
    const journal = path.join(this.config.dataDir, "workspace-migration.json");
    try {
      target = this.destination(this.parent);
      if (same(source, target)) return;
      // A same-volume rename can finish before the process is interrupted. Only
      // a journal written by this migration authorizes recovering that target.
      if (fs.existsSync(journal) && !fs.existsSync(source) && !fs.existsSync(staging) && fs.existsSync(target)) {
        const record = JSON.parse(fs.readFileSync(journal, "utf8"));
        if (record.from === source && record.to === target && record.phase === "rename") {
          fs.symlinkSync(target, source, process.platform === "win32" ? "junction" : "dir");
          this.commit(target);
          fs.unlinkSync(journal);
          return;
        }
      }
      if (fs.existsSync(staging)) {
        if (fs.existsSync(source)) throw new Error("发现未完成的沙箱迁移，请检查 .boost-moving 目录后重试");
        fs.renameSync(staging, source);
      }
      if (fs.existsSync(source) && fs.existsSync(target) && same(fs.realpathSync(source), fs.realpathSync(target))) {
        this.commit(target);
        if (fs.existsSync(journal)) fs.unlinkSync(journal);
        return;
      }
      if (fs.existsSync(target)) throw new Error("目标沙箱目录已存在，未覆盖任何内容");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(source)) {
        if (!fs.statSync(source).isDirectory() || fs.lstatSync(source).isSymbolicLink()) throw new Error("当前沙箱不是独立目录，无法安全迁移");
        fs.writeFileSync(journal, JSON.stringify({ from: source, to: target, phase: "rename" }), { mode: 0o600 });
        try { fs.renameSync(source, target); moved = true; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
          fs.writeFileSync(journal, JSON.stringify({ from: source, to: target, phase: "copy" }), { mode: 0o600 });
          created = true;
          fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true, filter: entry => {
            const stat = fs.lstatSync(entry);
            if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink > 1))) throw new Error("沙箱包含链接或特殊文件，请先移除这些项目再迁移");
            return true;
          } });
          fs.renameSync(source, staging);
        }
        // History and persisted task paths remain usable; this is an alias, not a second copy.
        fs.symlinkSync(target, source, process.platform === "win32" ? "junction" : "dir");
        linked = true;
      } else { fs.mkdirSync(target); created = true; }
      this.commit(target);
      // The cross-device source is removed only after config and compatibility alias commit.
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
      if (fs.existsSync(journal)) fs.unlinkSync(journal);
    } catch (error) {
      // Restore the original active directory if committing the new configuration failed.
      if (same(workspaceRoot(this.config), source)) {
        if (linked) fs.unlinkSync(source);
        if (moved) fs.renameSync(target, source);
        if (fs.existsSync(staging) && !fs.existsSync(source)) fs.renameSync(staging, source);
        if (created && fs.existsSync(target)) fs.rmSync(target, { recursive: true });
        if (fs.existsSync(source) && fs.existsSync(journal)) fs.unlinkSync(journal);
      }
      this.error = `沙箱迁移未完成：${(error as Error).message}。当前仍使用 ${workspaceRoot(this.config)}`;
    }
  }

  private commit(root: string) {
    saveConfigFile(this.config.dataDir, file => { file.workspaceRoot = root; });
    this.config.workspaceRoot = root;
    this.error = "";
  }
}
