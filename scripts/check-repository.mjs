// Validate the repository layout and maintained documentation without dependencies.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const requirePath = (path, owner) => {
  if (!existsSync(path)) errors.push(`${owner}: missing ${relative(root, path)}`);
};
for (const name of ['frontend/src', 'backend/core', 'backend/service', 'backend/web', 'backend/start', 'backend/desktop', 'bot/backend/src', 'bot/backend/api', 'bot/frontend/src', 'bot/assets', 'bot/shared', 'nginx/nginx.conf'])
  requirePath(resolve(root, name), 'layout');
for (const name of ['apps', 'crates', 'docker/nginx', 'bot/src', 'bot/ui', 'bot/api', 'bot/test', 'bot/scripts/spikes'])
  if (existsSync(resolve(root, name)) && walk(resolve(root, name), () => true).length)
    errors.push(`layout: obsolete directory ${name}`);

const cargo = readFileSync(resolve(root, 'Cargo.toml'), 'utf8');
for (const member of cargo.matchAll(/"(backend\/[^\"]+)"/g))
  requirePath(resolve(root, member[1], 'Cargo.toml'), 'Cargo workspace');
const native = resolve(root, 'backend/desktop');
const config = JSON.parse(readFileSync(resolve(native, 'tauri.conf.json'), 'utf8'));
requirePath(resolve(native, config.build.frontendDist, '..'), 'Tauri frontend directory');
for (const hook of [config.build.beforeDevCommand, config.build.beforeBuildCommand]) {
  const command = typeof hook === 'string' ? hook : hook?.script;
  const script = command?.match(/^node\s+(\S+)/)?.[1];
  if (script) requirePath(resolve(native, '..', script), 'Tauri hook');
}
for (const dependency of readFileSync(resolve(native, 'Cargo.toml'), 'utf8').matchAll(/path\s*=\s*"([^"]+)"/g))
  requirePath(resolve(native, dependency[1], 'Cargo.toml'), 'Desktop Cargo dependency');
for (const path of Object.keys(config.bundle.resources)) requirePath(resolve(native, path), 'Tauri resources');
for (const name of ['Dockerfile.all-in-one', 'Dockerfile.service', 'Dockerfile.web', 'Dockerfile.bot-api']) {
  const dockerfile = readFileSync(resolve(root, 'docker', name), 'utf8');
  for (const line of dockerfile.split(/\r?\n/)) {
    if (!line.startsWith('COPY ') || line.includes('--from=')) continue;
    for (const source of line.trim().split(/\s+/).slice(1, -1)) requirePath(resolve(root, source), `docker/${name}`);
  }
}

function walk(directory, predicate) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules','target','gen','out','dist','tmp','build','bin','.git'].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path, predicate) : predicate(path) ? [path] : [];
  });
}
for (const path of walk(root, path => relative(root, path).split(/[\\/]/).some(part => ['test', 'tests', '__tests__'].includes(part))))
  errors.push(`layout: standalone test file ${relative(root, path)}`);
const documents = [
  ...readdirSync(root).filter(name => name.endsWith('.md')).map(name => resolve(root, name)),
  ...walk(resolve(root, 'docs'), path => path.endsWith('.md')),
  ...['frontend','backend','bot','docker','nginx','scripts'].flatMap(name =>
    ['README.md','README.zh-CN.md'].map(file => resolve(root, name, file)).filter(existsSync)),
  resolve(root, 'bot/INTEGRATION.md'),
];
for (const path of documents) {
  const source = readFileSync(path, 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  const targets = [...source.matchAll(/!?\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map(match => match[1]);
  targets.push(...[...source.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]));
  for (const target of targets) {
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
    let decoded;
    try { decoded = decodeURIComponent(target.split(/[?#]/)[0]); } catch { errors.push(`${relative(root,path)}: malformed link ${target}`); continue; }
    if (!decoded) continue;
    const destination = resolve(dirname(path), decoded);
    const local = relative(root, destination);
    if (local.startsWith('..') || isAbsolute(local)) errors.push(`${relative(root,path)}: link outside repository: ${target}`);
    else requirePath(destination, relative(root,path));
  }
}
const en = readFileSync(resolve(root,'README.md'),'utf8');
const zh = readFileSync(resolve(root,'README.zh-CN.md'),'utf8');
for (const [name, text] of [['README.md',en],['README.zh-CN.md',zh]]) {
  if (!text.includes('img.shields.io/github/v/release/amine123max/Boost-bot')) errors.push(`${name}: missing dynamic Release badge`);
  if (!text.includes('api.star-history.com/svg?repos=amine123max/Boost-bot')) errors.push(`${name}: missing Star history`);
  if (!text.includes('http://localhost:12000')) errors.push(`${name}: missing normal Web entry`);
}
if ([...en.matchAll(/^## /gm)].length !== [...zh.matchAll(/^## /gm)].length) errors.push('README section counts differ');
const screenshots = text => [...text.matchAll(/docs\/images\/[\w.-]+/g)].map(match => match[0]).sort().join('\n');
if (screenshots(en) !== screenshots(zh)) errors.push('README screenshot sets differ');
if (errors.length) {
  console.error([...new Set(errors)].join('\n'));
  process.exitCode = 1;
} else console.log(`Repository layout, Tauri resources and ${documents.length} documentation files verified.`);
