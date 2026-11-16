// Repository Markdown keeps relative links; release bodies require repository URLs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [tag, commit, destination] = process.argv.slice(2);
const repository = process.env.GH_REPO || 'amine123max/Boost-bot';
if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag || '') || !/^[0-9a-f]{40}$/.test(commit || '') ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) || !destination)
  throw new Error('Expected release tag, source commit and output path');

function render(file) {
  return readFileSync(file, 'utf8').replace(/\]\(([^\s)]+)\)/g, (match, target) => {
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) return match;
    const [pathname, suffix = ''] = target.split(/(?=[?#])/s, 2);
    const local = relative(root, resolve(dirname(file), decodeURIComponent(pathname)));
    if (local.startsWith('..') || isAbsolute(local) || !existsSync(resolve(root, local)))
      throw new Error('Invalid release documentation link: ' + target);
    const encoded = local.split(sep).map(encodeURIComponent).join('/');
    return `](https://github.com/${repository}/blob/${commit}/${encoded}${suffix})`;
  });
}

const files = [resolve(root, 'docs/releases', tag + '.md'), resolve(root, 'docs/releases', tag + '.zh-CN.md')];
if (!files.every(existsSync)) throw new Error('Both release-note languages are required');
writeFileSync(resolve(destination), files.map(render).join('\n---\n\n'));
