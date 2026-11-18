import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { unzipSync } from 'fflate';

const target = process.argv[2];
if (!target) throw new Error('Usage: node bot/scripts/prepare-voice.mjs <voice-directory>');
const dir = resolve(target);
async function verified(url, size, sha) {
  const response = await fetch(url, {signal:AbortSignal.timeout(120_000)});
  if (!response.ok || !response.body) throw new Error('Voice asset download failed: ' + response.status);
  const chunks = [], reader = response.body.getReader();
  let bytes=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if(done) break;
      bytes+=value.length;
      if(bytes>size) throw new Error('Voice asset exceeds its expected size');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); }
  const data=Buffer.concat(chunks, bytes);
  if(data.length!==size || createHash('sha256').update(data).digest('hex')!==sha) throw new Error('Voice asset SHA-256 mismatch');
  return data;
}
async function install(file, data) {
  try { await writeFile(file,data,{flag:'wx'}); }
  catch(error) {
    if(error.code!=='EEXIST' || !data.equals(await readFile(file))) throw error;
  }
}
async function installVerified(name, url, size, sha) {
  const file = join(dir, name);
  let existing;
  try { existing = await readFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!existing) return install(file, await verified(url, size, sha));
  if (existing.length !== size || createHash('sha256').update(existing).digest('hex') !== sha) {
    throw new Error('Existing voice asset hash mismatch: ' + name);
  }
}
await mkdir(dir,{recursive:true});
const model='ggml-tiny-q5_1.bin';
await installVerified(model, 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/'+model,
  32152673, '818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7');
await installVerified('LICENSE-Whisper.txt', 'https://raw.githubusercontent.com/openai/whisper/v20250625/LICENSE',
  1063, 'b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d');
if(process.platform==='win32' && process.arch==='x64') {
  await Promise.all([
    installVerified('LICENSE-whisper-cpp.txt', 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.8.3/LICENSE',
      1078, 'e562a2ddfaf8280537795ac5ecd34e3012b6582a147ef69ba6a6a5c08c84757d'),
    installVerified('LICENSE-SDL2.txt', 'https://raw.githubusercontent.com/libsdl-org/SDL/release-2.28.5/LICENSE.txt',
      884, '9928507f684c1965d07f2b6ef4b4723d5efc2f6b4ab731f743a413c51c319927'),
  ]);
  const archive=await verified('https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip',3968674,
    'd824b1e37599f882b396e73f1ee0bfd5d0529f700314c48311dcbd00b803321d');
  const out=join(dir,'bin');await mkdir(out,{recursive:true});
  const files=unzipSync(archive,{filter:file=>/^(?:whisper-cli\.exe|[a-z0-9_.-]+\.dll)$/i.test(basename(file.name)) && file.originalSize<24*1024*1024});
  if(!Object.keys(files).some(key=>basename(key)==='whisper-cli.exe')) throw new Error('Verified archive does not contain whisper-cli');
  for(const [key,bytes] of Object.entries(files)) await install(join(out,basename(key)),Buffer.from(bytes));
} else console.log('Install whisper-cli v1.8.3 separately and place it on PATH.');
console.log('Verified Whisper multilingual Tiny Q5_1 installed in ' + dir);
