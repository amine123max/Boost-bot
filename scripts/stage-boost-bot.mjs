// Copy a prepared runtime into a service package directory, with all notices.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/stage-boost-bot.mjs <service-package-directory>');
const destination = resolve(process.argv[2], 'boost-bot');
const source = resolve(project, 'bot');
if (!existsSync(resolve(source, 'bin', process.platform === 'win32' ? 'node.exe' : 'node'))) throw new Error('Run node scripts/prepare-boost-bot.mjs first');
mkdirSync(destination, { recursive: true });
for (const name of ['dist','bots','assets','bin','node_modules','dsh-runtime','package.json','LICENSE','LICENSES','THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES_en.md']) cpSync(resolve(source,name),resolve(destination,name),{recursive:true});
console.log(`Boost Bot staged at ${destination}`);
