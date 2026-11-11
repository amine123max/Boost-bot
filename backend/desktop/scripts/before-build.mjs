import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const frontendDir = resolve(projectDir, 'frontend');
const task = process.argv[2] || 'build:desktop';
if (!['build:desktop', 'dev:desktop'].includes(task)) throw new Error(`Unsupported frontend task: ${task}`);
if (!existsSync(resolve(frontendDir,'package.json'))) throw new Error('Boost frontend package is missing');
const temporaryRoot = resolve(projectDir,'tmp');
const temporary = resolve(temporaryRoot,`boost-frontend-build-${process.pid}`);
mkdirSync(temporary,{recursive:true});
let status = 1;
try {
  const bot = spawnSync(process.execPath, [resolve(projectDir, 'scripts/prepare-boost-bot.mjs')], {
    stdio: 'inherit', windowsHide: true,
    env: {...process.env,TEMP:temporary,TMP:temporary,TMPDIR:temporary},
  });
  if (bot.error) throw bot.error;
  if (bot.status !== 0) throw new Error('Boost Bot preparation failed');
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',['--dir',frontendDir,'run',task],{
    stdio:'inherit', shell:process.platform === 'win32', windowsHide:true,
    env:{...process.env,TEMP:temporary,TMP:temporary,TMPDIR:temporary},
  });
  if(result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  const actual = realpathSync(temporary);
  const allowed = realpathSync(temporaryRoot) + sep;
  if(!actual.startsWith(allowed) || !actual.endsWith(`boost-frontend-build-${process.pid}`)) throw new Error('Invalid temporary cleanup path');
  rmSync(actual,{recursive:true,force:true});
}
process.exit(status);
