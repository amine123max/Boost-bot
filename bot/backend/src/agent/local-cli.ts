import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { Store } from '../store/db.js';
import type { TurnObserver } from './host.js';

export const localProviders = ['deepseek', 'claude', 'codex'] as const;
export type LocalProvider = typeof localProviders[number];
export function isLocalProvider(value: unknown): value is LocalProvider {
  return localProviders.some(provider => provider === value);
}

const sessionKey = (id: string) => 'local-agent-session:' + id;
const childPids = new Set<number>();
export const localAgentPids = () => [...childPids];
export const clearLocalAgent = (store: Store, id: string) => store.deleteKV(sessionKey(id));
const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
export function localSelection(store: Store, id: string): { provider: LocalProvider; session?: string } | undefined {
  try {
    const value = JSON.parse(store.getKV(sessionKey(id)) || 'null');
    if (isLocalProvider(value?.provider)) return { provider: value.provider, session: validId(value.session) ? value.session : undefined };
  } catch { /* An invalid record must not become a CLI argument. */ }
}
export function selectLocalAgent(store: Store, id: string, provider: LocalProvider) {
  store.setKV(sessionKey(id), JSON.stringify({ provider }));
}

interface Executable { file: string; prefix: string[] }
const names: Record<LocalProvider, string[]> = { codex: ['codex'], claude: ['claude'], deepseek: ['dsh', 'dsh-next'] };
function executable(file: string): boolean {
  try { return fs.statSync(file).isFile() && (fs.accessSync(file, fs.constants.X_OK), true); }
  catch { return false; }
}

/** Resolve installed program files only; the API never takes executable paths or shell commands. */
export function findLocalAgent(provider: LocalProvider): Executable | undefined {
  const home = os.homedir();
  const windows = process.platform === 'win32';
  const dirs = [...new Set([
    ...(process.env.PATH ?? '').split(path.delimiter),
    path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'),
    path.join(home, '.npm-global', 'bin'), path.join(home, '.volta', 'bin'),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm'),
  ].filter((dir): dir is string => !!dir && path.isAbsolute(dir)))];
  for (const dir of dirs) for (const base of names[provider]) {
    const native = path.join(dir, base + (windows ? '.exe' : ''));
    if (executable(native)) return { file: native, prefix: [] };
    if (!windows) continue;
    const modules = path.join(dir, 'node_modules');
    const candidates = provider === 'claude' ? [
      [path.join(modules, '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'), false],
      [path.join(modules, '@anthropic-ai', 'claude-code', 'cli.js'), true],
    ] as const : provider === 'codex' ? [
      [path.join(modules, '@openai', 'codex', 'bin', 'codex.js'), true],
    ] as const : [
      [path.join(modules, '@deepseek-ai', 'dsh', 'lib', 'bin.js'), true],
    ] as const;
    for (const [file, node] of candidates) if (executable(file)) {
      return node ? { file: process.execPath, prefix: [file] } : { file, prefix: [] };
    }
  }
  if (process.platform === 'darwin' && provider === 'deepseek') {
    for (const apps of ['/Applications', path.join(home, 'Applications')]) {
      const root = path.join(apps, 'DSH NEXT.app', 'Contents');
      const file = path.join(root, 'MacOS', 'DSH NEXT');
      if (executable(file)) return { file, prefix: [path.join(root, 'Resources', 'app.asar', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')] };
    }
  }
  if (process.platform === 'darwin' && provider === 'codex') {
    for (const apps of ['/Applications', path.join(home, 'Applications')]) {
      const file = path.join(apps, 'Codex.app', 'Contents', 'Resources', 'codex');
      if (executable(file)) return { file, prefix: [] };
    }
  }
}

export function localAgentAllowed(origin: string | undefined): boolean {
  return origin !== 'catalog' && (process.env.BOOST_BOT_HOSTED !== '1' || process.env.BOOST_BOT_ALLOW_TOOLS === '1');
}

function command(provider: LocalProvider, session: string | undefined, dshPatch?: string): string[] {
  if (provider === 'codex') return ['-a', 'never', '-c', 'sandbox_mode="read-only"',
    '-c', 'mcp_servers={}', '-c', 'features.multi_agent=false', '-c', 'features.codex_hooks=false',
    'exec', ...(session ? ['resume', session] : []), '--json', '--skip-git-repo-check', '-'];
  if (provider === 'claude') return ['--print', '--verbose', '--output-format', 'stream-json',
    '--include-partial-messages', '--permission-mode', 'dontAsk', '--tools', '',
    '--setting-sources', '', '--settings', '{"disableAllHooks":true}', '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}', ...(session ? ['--resume', session] : [])];
  return ['--profile', 'headless', '--patch', dshPatch!, '--json',
    ...(session ? ['--session-id', session] : []), '-'];
}

// Use a profile overlay, not flags that are absent in compatible older CLIs.
const DSH_PATCH = [
  '- id: sandbox-policy\n  config:\n    mode: read-only',
  '- id: approval\n  config:\n    policy: ask',
  '- id: permission\n  config:\n    presets:',
  ...['read-only', 'workspace-write', 'danger-full-access'].map(mode => `      ${mode}: { sandbox: read-only, approval: ask }`),
  '- id: credentials\n  disabled: false',
  ...['tool-bash', 'tool-pwsh', 'tool-plugin-manager', 'tool-web', 'tool-workflow', 'tool-subagent', 'tool-subagent-fork']
    .map(id => `- id: ${id}\n  disabled: true`),
].join('\n') + '\n';

function failure(stderr: string, resume: boolean): Error {
  if (/credential|not logged in|login required|authentication|unauthorized|api.key|\b401\b/i.test(stderr)) return new Error('CREDENTIAL_MISSING：请先在本机 CLI 完成登录或配置模型凭据。');
  if (resume && /locked|busy|in use|active.*session/i.test(stderr)) return new Error('SESSION_BUSY：请先结束该会话的其他运行。');
  if (resume && /session|thread|rollout/i.test(stderr)) return new Error('SESSION_NOT_FOUND：无法续接该会话，请新建对话。');
  return new Error('AGENT_RUN_FAILED：本机工具未返回完整回复，请检查该工具是否能在本机运行。');
}

export async function runLocalAgent(input: {
  store: Store; conversationId: string; provider: LocalProvider; session?: string;
  workspace: string; text: string; signal: AbortSignal; observer?: TurnObserver;
}): Promise<{text: string; session: string}> {
  const { provider, session, signal, observer } = input;
  const resolved = findLocalAgent(provider);
  if (!resolved) throw new Error('AGENT_UNAVAILABLE：未找到本机工具，请安装后重新扫描。');
  if (signal.aborted) throw signal.reason;
  const abort = AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)]);
  fs.mkdirSync(input.workspace, { recursive: true });
  const env = { ...process.env, ...(resolved.file.endsWith('DSH NEXT') ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };
  for (const key of Object.keys(env)) {
    if (/^(?:BOOST_|AMB_)/.test(key)) delete env[key as keyof typeof env];
  }
  let scratch: string | undefined;
  if (provider === 'deepseek') {
    Object.assign(env, { DSH_PERMISSION_MODE: 'read-only' });
    scratch = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'boost-local-dsh-'));
  }
  try {
    const patch = scratch ? path.join(scratch, 'policy.yml') : undefined;
    if (patch) fs.writeFileSync(patch, DSH_PATCH, { mode: 0o600 });
    return await new Promise<{text: string; session: string}>((resolve, reject) => {
      const process = spawn(resolved.file, [...resolved.prefix, ...command(provider, session, patch)], {
        cwd: input.workspace, env, signal: abort, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const pid = process.pid;
      if (pid) childPids.add(pid);
      const decoder = new StringDecoder('utf8');
      let pending = '', stderr = '', streamed = '', final = '', current = session, failed = false, completed = false;
      let outputError: Error | undefined;
      const acceptId = (id: unknown) => {
        if (!validId(id)) return;
        if (current && current !== id) throw new Error('SESSION_MISMATCH：本机工具返回了不同的会话，已停止。');
        if (current === id) return;
        current = id;
        input.store.setKV(sessionKey(input.conversationId), JSON.stringify({ provider, session: id }));
      };
      const delta = (part: unknown) => {
        if (typeof part !== 'string' || !part) return;
        streamed += part;
        if (streamed.length > 2_000_000) throw new Error('AGENT_OUTPUT_LIMIT：回复过长，已停止。');
        observer?.onText?.(part);
      };
      const event = (line: string) => {
        let row: any;
        try { row = JSON.parse(line); } catch { return; }
        if (!row || typeof row !== 'object') return;
        if (provider === 'codex') {
          if (row.type === 'thread.started') acceptId(row.thread_id);
          if (row.type === 'item.completed' && row.item?.type === 'agent_message') {
            if (final) observer?.onInterim?.(final);
            if (final) observer?.onText?.(null);
            final = String(row.item.text || '');
            delta(final);
          }
          if (row.type === 'turn.failed') { failed = true; stderr += String(row.error?.message || ''); }
          if (row.type === 'turn.completed') completed = true;
        } else if (provider === 'claude') {
          acceptId(row.session_id);
          if (row.type === 'stream_event' && row.event?.type === 'content_block_delta' && row.event.delta?.type === 'text_delta') delta(row.event.delta.text);
          if (row.type === 'result') { completed = true; failed = !!row.is_error || row.subtype !== 'success'; final = typeof row.result === 'string' ? row.result : ''; if (failed) stderr += final; }
        } else {
          acceptId(row.sessionId ?? row.data?.sessionId);
          if (row.type === 'text') delta(row.delta ?? row.data?.delta ?? row.text ?? row.data?.text);
          if (row.type === 'final') { completed = true; final = String(row.finalResponse ?? row.text ?? row.response ?? row.data?.text ?? ''); }
          if (row.type === 'error') { failed = true; stderr += String(row.message ?? row.error?.message ?? ''); }
        }
        stderr = stderr.slice(-8192);
      };
      const read = (data: string) => {
        pending += data;
        if (pending.length > 4_000_000) throw new Error('AGENT_OUTPUT_LIMIT：本机工具事件过长。');
        let end;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end);
          pending = pending.slice(end + 1);
          event(line);
        }
      };
      process.once('spawn', () => observer?.onStart?.());
      process.stdout.on('data', (bytes: Buffer) => {
        if (outputError) return;
        try { read(decoder.write(bytes)); }
        catch (error) { outputError = error as Error; process.kill(); }
      });
      process.stderr.on('data', (bytes: Buffer) => { stderr = (stderr + bytes.toString('utf8')).slice(-8192); });
      process.stdin.on('error', () => {}); // CLI may exit before it reads stdin.
      process.stdin.end(input.text);
      process.on('error', error => { if (!abort.aborted) outputError = new Error('AGENT_UNAVAILABLE：本机工具无法启动。', { cause: error }); });
      process.once('close', code => {
        if (pid) childPids.delete(pid);
        try {
          if (signal.aborted) throw signal.reason;
          if (abort.aborted) throw new Error('TIMEOUT：本机工具超过 10 分钟未完成。');
          if (outputError) throw outputError;
          read(decoder.end() + '\n');
          if (code !== 0 || failed || !completed || !current || !(final || streamed).trim()) throw failure(stderr, !!session);
          resolve({ text: final || streamed, session: current });
        } catch (error) { reject(error); }
      });
    });
  } finally {
    if (scratch) {
      try { fs.unlinkSync(path.join(scratch, 'policy.yml')); } catch { /* Already removed. */ }
      try { fs.rmdirSync(scratch); } catch { /* Leave user files untouched. */ }
    }
  }
}
