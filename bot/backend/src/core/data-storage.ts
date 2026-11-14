import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { saveConfigFile } from '../config.js';
import { lockDataDir, STALE_MS, type DataDirLock } from '../store/lock.js';
import { protectDataDirectory } from './data-storage-permissions.js';

const MARKER = '.boost-data-transfer.json';
const equal = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const contains = (a: string, b: string) => { const rel = path.relative(a, b); return !rel || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)); };
interface Transfer { version: 1; id: string; anchor: string; source: string; target: string; stage: string; phase: 'moving' | 'copied' | 'linked'; }

function json(file: string): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('无法读取数据迁移配置，请检查配置文件'); }
}
function aliveLock(root: string): void {
  const file = path.join(root, 'anymodel.lock');
  if (!fs.existsSync(file)) return;
  let holder: Record<string, unknown>;
  try { holder = json(file); } catch { return; } // lockDataDir handles an interrupted lock write.
  if (holder.host !== os.hostname()) {
    if (Date.now() - Math.max(Number(holder.at) || 0, fs.statSync(file).mtimeMs) < STALE_MS) throw new Error('数据目录仍被其他主机使用');
    return;
  }
  if (holder.pid === process.pid) return;
  try { process.kill(Number(holder.pid), 0); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') return; }
  throw new Error('数据目录仍被其他宿主使用，请先退出对应 Boost');
}
function digest(file: string): string {
  const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024), fd = fs.openSync(file, 'r');
  try { let count: number; while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count)); }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function files(root: string): Map<string, string> {
  const result = new Map<string, string>();
  function visit(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name), rel = path.relative(root, file), stat = fs.lstatSync(file);
      if (rel === MARKER) continue;
      if (stat.isSymbolicLink()) result.set(rel, 'link:' + path.resolve(path.dirname(file), fs.readlinkSync(file)));
      else if (stat.isDirectory()) { result.set(rel, 'dir'); visit(file); }
      else if (stat.isFile()) result.set(rel, `${stat.size}:${digest(file)}`);
      else throw new Error('数据目录含不支持迁移的特殊文件');
    }
  }
  visit(root); return result;
}
function copy(source: string, target: string, top = true) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (top && entry.name === MARKER) continue;
    const from = path.join(source, entry.name), to = path.join(target, entry.name), stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) fs.symlinkSync(path.resolve(path.dirname(from), fs.readlinkSync(from)), to, fs.statSync(from).isDirectory() ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file');
    else if (stat.isDirectory()) { fs.mkdirSync(to, { mode: stat.mode & 0o777 }); copy(from, to, false); fs.utimesSync(to, stat.atime, stat.mtime); }
    else if (stat.isFile()) {
      // Create a new file under the restricted destination ACL. CopyFile on
      // Windows may also copy the source's inherited security descriptor.
      const input = fs.openSync(from, 'r'), buffer = Buffer.allocUnsafe(1024 * 1024);
      let output: number | undefined;
      try {
        output = fs.openSync(to, 'wx', 0o600);
        let count: number;
        while ((count = fs.readSync(input, buffer, 0, buffer.length, null))) {
          let written = 0;
          while (written < count) written += fs.writeSync(output, buffer, written, count - written);
        }
        fs.fsyncSync(output);
      } finally { fs.closeSync(input); if (output !== undefined) fs.closeSync(output); }
      fs.chmodSync(to, stat.mode & 0o777); fs.utimesSync(to, stat.atime, stat.mtime);
    }
    else throw new Error('数据目录含不支持迁移的特殊文件');
  }
}

/** Actor-scoped Bot data only. The fixed anchor remains a compatibility alias. */
export class BotDataStorage {
  private error = '';
  private readonly journal: string;
  constructor(readonly anchor: string) {
    if (!path.isAbsolute(anchor)) throw new Error('Bot数据锚点必须是绝对路径');
    this.journal = anchor + '.data-migration.json';
  }
  private config() { const file = path.join(this.anchor, 'config.json'); return fs.existsSync(file) ? json(file) : {}; }
  private root() { return fs.existsSync(this.anchor) ? fs.realpathSync(this.anchor) : this.anchor; }
  private destination(parent: string): string {
    if (!parent.trim()) return this.root();
    if (!path.isAbsolute(parent.trim()) || parent.includes('\0')) throw new Error('请填写运行 Boost 的电脑上的绝对文件夹路径');
    const base = path.resolve(parent.trim()), boost = path.basename(base).toLowerCase() === 'boost' ? base : path.join(base, 'Boost');
    const saved = this.config().workspaceIdentity;
    const identity = typeof saved === 'string' && path.isAbsolute(saved) ? saved : this.root();
    const scope = createHash('sha256').update(process.platform === 'win32' ? identity.toLowerCase() : identity).digest('hex').slice(0, 16);
    return path.join(boost, 'bots', scope, 'data');
  }
  validate(parent: string): void {
    const target = this.destination(parent), source = this.root();
    if (equal(source, target)) return;
    if (contains(source, target) || contains(target, source)) throw new Error('新旧数据目录不能互相包含');
    const workspace = this.config().workspaceRoot;
    if (typeof workspace === 'string' && (contains(workspace, target) || contains(target, workspace))) throw new Error('数据目录不能与现有沙箱互相包含');
    if (fs.existsSync(target)) throw new Error('目标数据目录已存在，请选择未使用的位置，避免覆盖');
    let ancestor = path.dirname(target);
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    if (!equal(path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, target)), target)) throw new Error('目标数据目录的父路径不能通过链接重定向');
  }
  view() {
    const parent = String(this.config().dataParent || ''), root = this.root();
    return { parent, root, pendingRoot: this.destination(parent), restartRequired: !equal(root, this.destination(parent)), error: this.error };
  }
  schedule(parent: string) {
    this.validate(parent);
    saveConfigFile(this.anchor, file => { file.dataParent = parent.trim(); });
    this.error = ''; return this.view();
  }
  private owned(root: string, record: Transfer): boolean {
    try { const owner = json(path.join(root, MARKER)); return owner.id === record.id && owner.anchor === this.anchor; } catch { return false; }
  }
  private write(record: Transfer) {
    const file = this.journal + '.tmp'; fs.writeFileSync(file, JSON.stringify(record), { mode: 0o600 }); fs.renameSync(file, this.journal);
  }
  private alias(from: string, to: string) { fs.symlinkSync(to, from, process.platform === 'win32' ? 'junction' : 'dir'); }
  private recover() {
    if (!fs.existsSync(this.journal)) return;
    const record = json(this.journal) as unknown as Transfer;
    if (record.version !== 1 || record.anchor !== this.anchor || record.stage !== record.source + '.boost-data-moving'
      || !path.isAbsolute(record.source) || !path.isAbsolute(record.target) || contains(record.source, record.target) || contains(record.target, record.source)) throw new Error('发现无效的数据迁移记录，未更改目录');
    for (const root of [record.source, record.target, record.stage]) if (fs.existsSync(root)) aliveLock(root);
    if (!fs.existsSync(record.source) && fs.existsSync(record.stage) && !this.owned(record.target, record)) {
      if (!this.owned(record.stage, record)) throw new Error('无法确认未完成迁移的目录归属');
      fs.renameSync(record.stage, record.source);
    }
    if (!fs.existsSync(record.source) && this.owned(record.target, record)) this.alias(record.source, record.target);
    if (fs.existsSync(record.source) && fs.lstatSync(record.source).isSymbolicLink() && equal(fs.realpathSync(record.source), record.target)) {
      saveConfigFile(this.anchor, file => { file.workspaceIdentity ||= record.source; });
      if (fs.existsSync(record.stage)) {
        if (!this.owned(record.stage, record)) throw new Error('无法确认迁移暂存目录归属');
        fs.rmSync(record.stage, { recursive: true });
      }
      if (this.owned(record.target, record)) fs.unlinkSync(path.join(record.target, MARKER));
      fs.unlinkSync(this.journal); return;
    }
    if (!fs.existsSync(record.source)) throw new Error('数据迁移源目录不可用，已停止启动以保护会话');
    if (fs.existsSync(record.target)) {
      if (!this.owned(record.target, record)) throw new Error('目标目录归属不明，未覆盖任何内容');
      fs.rmSync(record.target, { recursive: true });
    }
    if (this.owned(record.source, record)) fs.unlinkSync(path.join(record.source, MARKER));
    fs.unlinkSync(this.journal);
  }
  /** Before Store/logs/channels open; transfer this lock to App for its full lifetime. */
  prepare(): DataDirLock {
    const guard = lockDataDir(this.anchor + '.migration-guard');
    try {
      this.recover();
      aliveLock(this.anchor);
      const lock = lockDataDir(this.anchor);
      const hadDatabase = fs.existsSync(path.join(this.anchor, 'boost-bot.db'));
      try { this.activate(); }
      catch (error) {
        if (!fs.existsSync(this.anchor) || (hadDatabase && !fs.existsSync(path.join(this.anchor, 'boost-bot.db')))) { lock.release(); throw error; }
        this.error = `数据迁移未完成：${(error as Error).message}。当前使用 ${this.root()}`;
      }
      return lock;
    } finally { guard.release(); }
  }
  private activate() {
    const parent = String(this.config().dataParent || ''), source = this.root(), target = this.destination(parent);
    if (equal(source, target)) return;
    this.validate(parent);
    const record: Transfer = { version: 1, id: randomUUID(), anchor: this.anchor, source, target, stage: source + '.boost-data-moving', phase: 'moving' };
    if (fs.existsSync(record.stage) || fs.existsSync(path.join(source, MARKER))) throw new Error('发现未完成的数据迁移，请先处理原迁移记录');
    saveConfigFile(this.anchor, file => { file.workspaceIdentity ||= source; });
    this.write(record);
    fs.writeFileSync(path.join(source, MARKER), JSON.stringify(record), { mode: 0o600, flag: 'wx' });
    let moved = false, created = false, linked = false;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      try { fs.renameSync(source, target); moved = true; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
        fs.mkdirSync(target, { mode: 0o700 }); created = true;
        fs.writeFileSync(path.join(target, MARKER), JSON.stringify(record), { mode: 0o600, flag: 'wx' });
        protectDataDirectory(target);
        copy(source, target);
        const original = files(source), copied = files(target);
        if (original.size !== copied.size || [...original].some(([key, value]) => copied.get(key) !== value)) throw new Error('数据复制校验失败，保留原目录');
        record.phase = 'copied'; this.write(record);
        fs.renameSync(source, record.stage);
      }
      if (moved) protectDataDirectory(target);
      this.alias(source, target); linked = true;
      record.phase = 'linked'; this.write(record);
      if (fs.existsSync(record.stage)) {
        if (!this.owned(record.stage, record)) throw new Error('暂存目录归属校验失败');
        fs.rmSync(record.stage, { recursive: true });
      }
      fs.unlinkSync(path.join(target, MARKER));
      fs.unlinkSync(this.journal);
    } catch (error) {
      if (!linked) {
        if (moved && !fs.existsSync(source)) fs.renameSync(target, source);
        if (fs.existsSync(record.stage) && !fs.existsSync(source)) fs.renameSync(record.stage, source);
        if (created && this.owned(target, record)) fs.rmSync(target, { recursive: true });
        if (this.owned(source, record)) fs.unlinkSync(path.join(source, MARKER));
        if (fs.existsSync(source) && fs.existsSync(this.journal)) fs.unlinkSync(this.journal);
      }
      throw error;
    }
  }
}
