// Prepare the embedded Bot, tools and the Node runtime used by service/desktop builds.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, cpSync, realpathSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(project, 'bot');
const tmpRoot = resolve(project, 'tmp');
const scratch = resolve(tmpRoot, `boost-bot-prepare-${process.pid}`);
mkdirSync(scratch, { recursive: true });
const env = { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch, npm_config_cache: resolve(scratch, 'npm-cache') };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const archArg = process.argv.find(arg => arg.startsWith('--arch='))?.slice(7);
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || '';
const requestedArch = archArg || (triple.startsWith('x86_64-') ? 'x64' : triple.startsWith('aarch64-') ? 'arm64' : process.arch);
const targetArch = requestedArch === 'x86_64' ? 'x64' : requestedArch;
if (!['x64','arm64'].includes(targetArch)) throw new Error(`Unsupported Bot architecture: ${targetArch}`);
const cross = targetArch !== process.arch;
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Boost Bot preparation failed: ${command} ${args.join(' ')}`);
}
try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('Boost Bot requires Node.js 22.13+');
  if (['typescript', 'vue', 'vite', 'vue-tsc', '@vitejs/plugin-vue'].some(name => !existsSync(resolve(root, 'node_modules', name)))) run(npm, ['ci', '--no-audit', '--no-fund']);
  if (!process.argv.includes('--skip-tools')) {
    if (cross) run(process.execPath, ['scripts/prepare-dsh.mjs','--os',process.platform,'--cpu',targetArch]);
    else if (!existsSync(resolve(root, 'dsh-runtime/node_modules/@deepseek-ai/dsh-sdk-client/package.json'))) run(npm, ['ci', '--omit=dev', '--no-audit', '--no-fund'], resolve(root, 'dsh-runtime'));
    const platform = `${process.platform}-${targetArch}`;
    const driver = process.platform === 'win32' ? 'cua-driver.exe' : 'cua-driver';
    if (cross || !existsSync(resolve(root, 'bin/cua-driver', driver))) {
      const driverOutput = resolve(scratch,'cua-driver');
      run(process.execPath, ['scripts/fetch-cua-driver.mjs','--target',platform,'--output',driverOutput]);
      cpSync(resolve(driverOutput, platform), resolve(root, 'bin/cua-driver'), { recursive: true });
    }
  }
  run(npm, ['run', 'build']);
  mkdirSync(resolve(root, 'bin'), { recursive: true });
  const destination = resolve(root, 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
  if (cross) {
    const platform = process.platform === 'win32' ? 'win' : process.platform;
    const name = `node-v${process.versions.node}-${platform}-${targetArch}`;
    const filename = `${name}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
    const base = `https://nodejs.org/dist/v${process.versions.node}/`;
    const response = await fetch(base + filename, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Node download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sums = await fetch(base + 'SHASUMS256.txt', { signal: AbortSignal.timeout(25_000) });
    if (!sums.ok) throw new Error('Cannot verify Node distribution');
    const expected = (await sums.text()).split('\n').find(line=>line.endsWith(`  ${filename}`))?.split(/\s+/)[0];
    if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Node distribution checksum mismatch');
    const archive = resolve(scratch,filename);
    writeFileSync(archive,bytes);
    run('tar',['-xf',archive,'-C',scratch]);
    copyFileSync(resolve(scratch,name,process.platform === 'win32' ? 'node.exe' : 'bin/node'),destination);
    copyFileSync(resolve(scratch,name,'LICENSE'),resolve(root,'bin/LICENSE-node.txt'));
  } else if (!existsSync(destination) || readFileSync(destination).length !== readFileSync(process.execPath).length) copyFileSync(process.execPath, destination);
  // Keep the notice for the exact Node version being distributed.
  const notice = resolve(root, 'bin/LICENSE-node.txt');
  if (!existsSync(notice)) {
    const local = resolve(dirname(process.execPath), 'LICENSE');
    if (existsSync(local)) copyFileSync(local, notice);
    else {
      const url = `https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`;
      if (process.platform === 'win32') {
        const result = spawnSync('curl.exe', ['--fail', '--location', '--max-time', '25', '--output', notice, url], { env, windowsHide: true, stdio: 'inherit' });
        if (result.status !== 0) throw new Error('Cannot retrieve Node distribution license');
      } else {
        const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
        if (!response.ok) throw new Error(`Cannot retrieve Node distribution license: HTTP ${response.status}`);
        writeFileSync(notice, await response.text());
      }
    }
  }
  console.log('Boost Bot runtime prepared in bot/');
} finally {
  const actual = realpathSync(scratch);
  if (!actual.startsWith(realpathSync(tmpRoot) + sep) || !actual.endsWith(`boost-bot-prepare-${process.pid}`)) throw new Error('Invalid Bot scratch cleanup path');
  rmSync(actual, { recursive: true, force: true });
}
