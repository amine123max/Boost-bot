// Build a self-contained runtime. Only generated files below bot/dist are cleared.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
rmSync(output, { recursive: true, force: true });

function run(module, args) {
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules', module), ...args], {
    cwd: root, env: process.env, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Bot build failed: ${module} (${result.status})`);
}

run('typescript/bin/tsc', ['-p', 'backend/tsconfig.json']);
for (const [source, destination] of [
  ['frontend/styles/design', 'ui/design'],
  ['frontend/styles/css', 'ui/css'],
  ['frontend/compat/botkit', 'ui/botkit'],
  ['assets/web', 'ui/assets'],
  ['dist/shared/appearance', 'ui/boost-appearance'],
]) {
  const target = resolve(output, destination);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolve(root, source), target, { recursive: true });
}
run('vue-tsc/bin/vue-tsc.js', ['--noEmit', '-p', 'frontend/tsconfig.json']);
run('vite/bin/vite.js', ['build', '--config', 'frontend/vite.config.ts']);
console.log('Bot backend and Vue workspace built in bot/dist/');
