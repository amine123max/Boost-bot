import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

let currentSid: string | undefined;
/** Bot databases contain channel credentials; never inherit a shared drive's public ACL. */
export function protectDataDirectory(directory: string): void {
  if (process.platform !== 'win32') { fs.chmodSync(directory, 0o700); return; }
  const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  if (!currentSid) {
    const identity = spawnSync(path.join(system, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    currentSid = identity.status === 0 ? identity.stdout.match(/S-1-\d+(?:-\d+)+/)?.[0] : undefined;
  }
  if (!currentSid) throw new Error('无法确认数据目录所有者，已保留原数据');
  const result = spawnSync(path.join(system, 'icacls.exe'), [directory, '/inheritance:r', '/grant:r',
    `*${currentSid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (result.status !== 0) throw new Error('无法保护新数据目录的访问权限，请选择支持访问权限的本机磁盘；原数据保留');
}
