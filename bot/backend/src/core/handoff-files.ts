import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface SharedArtifact { sourceBot: string; name: string; path: string; sha256: string; size: number }

/** Copy an explicitly group-delivered artifact into the recipient workspace.
 * No HTTP re-fetch, model rewriting, credential forwarding, or shared private dirs.
 */
export async function handoffFile(input: { groupId: string; sourceBot: string; source: string; workspace: string; boundary?: string }): Promise<SharedArtifact> {
  const stat = await fs.lstat(input.source);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('协作文件必须是普通文件');
  if (stat.size > 16 * 1024 * 1024) throw new Error('协作文件超过 16 MiB，请拆分交付');
  const bytes = await fs.readFile(input.source);
  const after = await fs.lstat(input.source);
  if (bytes.length !== stat.size || bytes.length > 16 * 1024 * 1024 || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('交付文件在传递中改变，请重新交付');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const group = createHash('sha256').update(input.groupId).digest('hex').slice(0, 16);
  await fs.mkdir(input.workspace, { recursive: true });
  if ((await fs.lstat(input.workspace)).isSymbolicLink()) throw new Error('协作工作区不能是符号链接');
  const root = await fs.realpath(input.workspace);
  if (input.boundary && !root.startsWith((await fs.realpath(input.boundary)) + path.sep)) throw new Error('协作工作区越界');
  const directory = path.join(root, 'handoffs', group);
  await fs.mkdir(directory, { recursive: true });
  const realDirectory = await fs.realpath(directory);
  if (!realDirectory.startsWith(root + path.sep)) throw new Error('协作文件目录越界');
  const extension = path.extname(input.source).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 16);
  const target = path.join(realDirectory, sha256 + extension);
  try { await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = await fs.lstat(target);
    if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1 || createHash('sha256').update(await fs.readFile(target)).digest('hex') !== sha256) throw new Error('已有协作文件校验失败');
  }
  return { sourceBot: input.sourceBot, name: path.basename(input.source), path: path.relative(root, target).split(path.sep).join('/'), sha256, size: bytes.length };
}
