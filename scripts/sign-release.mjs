// Sign exact release metadata; private key arrives only through the CI secret environment.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { createReadStream, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(process.argv[2] || 'tmp/boost-release/artifacts');
const tag = process.env.RELEASE_TAG || '';
const commit = process.env.RELEASE_COMMIT || process.env.GITHUB_SHA || '';
if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag) || !/^[0-9a-f]{40}$/.test(commit))
  throw new Error('Release tag and immutable source commit are required');
const privateKey = createPrivateKey(process.env.BOOST_RELEASE_SIGNING_KEY || '');
delete process.env.BOOST_RELEASE_SIGNING_KEY;
const publicKey = createPublicKey(readFileSync(join(project, 'backend/desktop/release-public-key.pem')));
const challenge = Buffer.from('Boost release key consistency');
if (!verify(null, challenge, publicKey, sign(null, challenge, privateKey))) throw new Error('Release signing key does not match the bundled verifier');

function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : /\.(exe|dmg)$/.test(entry.name) ? [path] : [];
  });
}
const assets = [];
for (const file of files(directory).sort()) {
  const name = basename(file), hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const target = name.endsWith('.dmg') ? 'macos-aarch64' : name.endsWith('.exe') ? 'windows-x86_64' : '';
  if (!target || assets.some(asset => asset.name === name)) throw new Error('Unsupported or duplicated release asset');
  assets.push({ name, target, size: statSync(file).size, sha256: hash.digest('hex') });
}
if (assets.length !== 3) throw new Error('Expected portable EXE, installer EXE and DMG');
const payload = JSON.stringify({ formatVersion: 1, repository: process.env.GH_REPO || 'amine123max/Boost-bot', tag, commit, assets });
const signature = sign(null, Buffer.from(payload), privateKey).toString('base64');
writeFileSync(join(directory, 'update-manifest.json'), JSON.stringify({ payload, signature }) + '\n');
console.log('Signed release manifest for ' + tag + ' at ' + commit);
