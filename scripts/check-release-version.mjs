import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2] || process.env.RELEASE_TAG || '';
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  throw new Error('Release tag must use vMAJOR.MINOR.PATCH (optionally with a prerelease suffix)');
}
const version = tag.slice(1);
for (const path of ['Cargo.toml', 'backend/desktop/Cargo.toml', 'backend/desktop/tauri.conf.json', 'frontend/package.json', 'bot/package.json', 'bot/package-lock.json']) {
  const source = readFileSync(resolve(root, path), 'utf8');
  const actual = path.endsWith('.json') ? JSON.parse(source).version : source.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (actual !== version) throw new Error(`${path}: version ${actual} does not match release ${tag}; update version fields before tagging`);
}
console.log(`Release versions match ${tag}`);
