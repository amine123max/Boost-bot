import fs from 'node:fs';
import path from 'node:path';

/** Rebase persisted regular sessions before DSH validates their old directory. */
export function rebaseSessionWorkspace(home: string, sessionId: string, workspace: string): boolean {
  if (!/^session-[a-f0-9]{32}$/i.test(sessionId)) return false;
  const file = path.join(home, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`);
  if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) return false;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  const identity = value?.record?.identity;
  const row = value?.record?.rows?.workingDirectory;
  const old = identity?.cwd;
  if (typeof old !== 'string' || !path.isAbsolute(old) || !path.isAbsolute(workspace)) return false;
  const same = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (same(path.resolve(old), path.resolve(workspace)) || !same(path.basename(old), path.basename(workspace))) return false;
  if (!fs.statSync(workspace).isDirectory()) return false;
  // Preserve a session's chosen subfolder; never expand a previously external directory.
  if (typeof row?.val === 'string') {
    const relative = path.relative(old, row.val);
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) return false;
    const target = path.join(workspace, relative);
    if (!fs.existsSync(target)) return false;
    row.val = target;
  }
  identity.cwd = workspace;
  const pending = file + '.workspace.pending';
  let created = false;
  try {
    fs.writeFileSync(pending, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    created = true;
    fs.renameSync(pending, file);
  } catch (error) {
    if (created && fs.existsSync(pending)) fs.rmSync(pending, { force: true });
    throw error;
  }
  return true;
}
