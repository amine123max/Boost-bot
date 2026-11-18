import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, getDuration, isSilk } from 'silk-wasm';

export const VOICE_BYTES = 8 * 1024 * 1024;
const PCM_LIMIT = 90 * 16_000 * 2;
const MODEL = 'ggml-tiny-q5_1.bin';
const BUNDLED_VOICE = fileURLToPath(new URL('../../../voice/', import.meta.url));
function wav(pcm: Uint8Array): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
function wavPcm(data: Buffer): Buffer | undefined {
  if (data.length < 44 || data.toString('ascii',0,4) !== 'RIFF' || data.toString('ascii',8,12) !== 'WAVE') return;
  let mono = false;
  for (let i = 12; i + 8 <= data.length;) {
    const name = data.toString('ascii',i,i+4), size=data.readUInt32LE(i+4), start=i+8;
    if (start + size > data.length) return;
    if (name === 'fmt ' && size >= 16) mono = data.readUInt16LE(start) === 1 && data.readUInt16LE(start+2) === 1 && data.readUInt32LE(start+4) === 16000 && data.readUInt16LE(start+14) === 16;
    if (name === 'data' && mono && !(size % 2)) return data.subarray(start,start+size);
    i=start+size+(size%2);
  }
}

async function run(command: string, args: string[], scratch: string, timeout: number, input?: Buffer): Promise<Buffer> {
  const signal = AbortSignal.timeout(timeout);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, signal, cwd:scratch,
      env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,
        TEMP:scratch,TMP:scratch,TMPDIR:scratch}, stdio:['pipe','pipe','ignore'] });
    const parts: Buffer[] = [];
    let size = 0, failed = false;
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > PCM_LIMIT + 4096) { failed = true; child.kill(); }
      else parts.push(chunk);
    });
    child.once('error', () => { failed = true; });
    child.once('close', code => failed || code !== 0
      ? reject(new Error('本机音频工具未能处理这条语音'))
      : resolve(Buffer.concat(parts)));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/** Host-only transcription, one inference at a time, without sending raw audio to a model gateway. */
export class LocalVoice {
  private line = Promise.resolve();
  private admitted = 0;
  private get dir() {
    const local = path.join(this.dataDir, 'voice');
    return process.env.BOOST_BOT_VOICE_DIR || (existsSync(path.join(local, MODEL)) ? local : BUNDLED_VOICE);
  }
  private get model() { return path.join(this.dir, MODEL); }
  get ready() { return existsSync(this.model); }
  constructor(private dataDir: string) {}

  transcribe(data: Buffer): Promise<string> {
    if (!this.ready || !data.length || data.length > VOICE_BYTES || this.admitted >= 4) {
      return Promise.reject(new Error('语音超限、转写繁忙，或尚未安装本机模型'));
    }
    this.admitted++;
    const work = this.line.then(() => this.recognize(data)).finally(() => { this.admitted--; });
    this.line = work.then(() => {}, () => {});
    return work;
  }

  private async recognize(data: Buffer): Promise<string> {
    const temp = path.resolve(process.env.TMPDIR || path.join(this.dataDir, 'tmp'));
    await mkdir(temp, {recursive:true});
    const scratch = await mkdtemp(path.join(temp,'boost-voice-'));
    try {
      let pcm: Uint8Array;
      if (isSilk(data)) {
        const duration = getDuration(data);
        if (duration <= 0 || duration > 90_000) throw new Error('语音不得超过 90 秒');
        pcm = (await decode(data,16000)).data;
      } else {
        pcm = wavPcm(data) ?? await run(process.env.BOOST_BOT_VOICE_FFMPEG || 'ffmpeg', [
          '-nostdin','-v','error','-protocol_whitelist','pipe','-i','pipe:0',
          '-vn','-t','90','-ac','1','-ar','16000','-f','s16le','pipe:1',
        ], scratch, 15_000, data);
      }
      if (pcm.length === 0 || pcm.length > PCM_LIMIT) throw new Error('语音长度无效');
      const input=path.join(scratch,'voice.wav'), output=path.join(scratch,'result');
      await writeFile(input,wav(pcm));
      const name = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
      const installed = path.resolve(this.dir, 'bin', name);
      await run(process.env.BOOST_BOT_VOICE_WHISPER || (existsSync(installed) ? installed : name),
        ['-m',path.resolve(this.model),'-f',input,'-l','auto','-t','2','-ng','-nt','-otxt','-of',output], scratch, 90_000);
      return (await readFile(output + '.txt','utf8')).trim().slice(0,8000);
    } finally { await rm(scratch, {recursive:true,force:true}).catch(() => {}); }
  }
}
