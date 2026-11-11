import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
mkdirSync(new URL('ui/boost-appearance', root), { recursive: true });
cpSync(new URL('dist/shared/appearance/', root), new URL('ui/boost-appearance/', root), { recursive: true });
console.log('Boost avatar modules ready');
