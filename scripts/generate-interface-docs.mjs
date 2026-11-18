// Derive method names from maintained dispatch sources; descriptions are reviewed domain summaries.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dispatch = join(root, 'backend/service/src/rpc_dispatch');
const files = readdirSync(dispatch).filter(name => name.endsWith('.rs')).map(name => join(dispatch, name));
files.push(join(root, 'backend/service/src/plugin/mod.rs'));
const methods = new Map();
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/"([A-Za-z][A-Za-z0-9]*(?:\/[A-Za-z][A-Za-z0-9]*)+)"\s*=>/g))
    methods.set(match[1], relative(root, file).replaceAll('\\', '/'));
}
methods.set('initialize', 'backend/service/src/rpc_dispatch/mod.rs');
const domains = {
  account: ['Accounts, authorization and usage', '账号、授权与用量'],
  accountManager: ['Users, sessions, ownership and wallets', '用户、会话、归属与钱包'],
  aggregateApi: ['Aggregate upstreams and supplier models', '聚合上游与供应商模型'],
  apikey: ['Platform keys, model catalog and source mappings', '平台密钥、模型目录与来源映射'],
  appSettings: ['Application configuration', '应用配置'],
  dashboard: ['Usage and management summaries', '用量与管理汇总'],
  gateway: ['Routing, proxies, transport and background workers', '路由、代理、传输与后台任务'],
  initialize: ['Service identity and version', '服务标识与版本'],
  modelGroups: ['Member model access and pricing groups', '成员模型权限与计费分组'],
  plugin: ['Plugin installation, logs and tasks', '插件安装、日志与任务'],
  quota: ['Quota pools, source capacity, prices and billing rules', '额度池、来源容量、定价与计费规则'],
  requestlog: ['Authorized request history and summaries', '受权请求历史与汇总'],
  service: ['Listener configuration, diagnostics and host telemetry', '监听配置、诊断与主机遥测'],
  startup: ['Actor-aware startup snapshot', '按身份裁剪的启动快照'],
  webAuth: ['Shared-access authentication configuration', '共享访问鉴权配置'],
};

for (const language of ['en', 'zh-CN']) {
  const chinese = language === 'zh-CN';
  const other = chinese ? '../../en/report/system-internal-interface-inventory.md' : '../../zh-CN/report/系统内部接口总表.md';
  const target = join(root, 'docs', language, 'report', chinese ? '系统内部接口总表.md' : 'system-internal-interface-inventory.md');
  const lines = [chinese ? '# 内部接口与传输约定' : '# Internal interfaces and transport contracts', '',
    `[${chinese ? 'English' : '简体中文'}](${other}) · [${chinese ? '系统架构' : 'Architecture'}](../../../ARCHITECTURE${chinese ? '.zh-CN' : ''}.md)`, '',
    chinese ? '方法名称由服务端分发代码生成，参数与响应以类型化前端封装和 Rust 类型为准。此表是内部协作参考，不是允许绕过会话、角色或归属的公共 API。' : 'Method names are generated from service dispatch. Parameters and responses are defined by typed frontend wrappers and Rust types. This is an internal integration reference, not a public authorization bypass.', '',
    chinese ? '## 传输与身份' : '## Transport and identity', '',
    chinese ? '| 入口 | 约定 |' : '| Entry | Contract |', '| --- | --- |',
    chinese ? '| Tauri IPC | 使用集中 invoke/invokeFirst，服务地址通过 withAddr；原生命令按注册表提供 |' : '| Tauri IPC | Central invoke/invokeFirst; service address through withAddr; native registry defines availability |',
    chinese ? '| Web POST /api/rpc | Boost Web 校验会话，推导 actor 后转发到内部 RPC |' : '| Web POST /api/rpc | Boost Web validates the session and derives the actor before forwarding |',
    chinese ? '| Service POST /rpc | 内部 RPC 凭据与可信 actor；不能暴露凭据给普通客户端 |' : '| Service POST /rpc | Internal credential and trusted actor; never disclose that credential to ordinary clients |',
    chinese ? '| 模型 /v1/ | 平台 key、模型权限、配额与计量，独立于管理 RPC |' : '| Model /v1/ | Platform key, model access, quota and accounting, independently of management RPC |', '',
    chinese ? '请求使用 JSON-RPC 方法名；前端 underscore 命令与 camelCase/斜线方法映射必须同步。新增或重命名时同时修改实现、桌面注册、Web 映射和前端类型。' : 'Requests use JSON-RPC method names. Frontend underscore commands and camelCase/slash RPC names must remain synchronized across implementation, native registration, Web mapping and typed wrappers.', '',
    chinese ? '## 分发方法' : '## Dispatched methods', '',
    chinese ? '| 方法 | 领域职责 | 实现 |' : '| Method | Domain | Implementation |', '| --- | --- | --- |'];
  for (const [method, source] of [...methods].sort(([a],[b]) => a.localeCompare(b))) {
    const group = method.split('/')[0];
    const description = domains[group]?.[chinese ? 1 : 0] || group;
    lines.push(`| \`${method}\` | ${description} | [${source.split('/').at(-1)}](../../../${source}) |`);
  }
  lines.push('', chinese ? '## 调度与错误语义' : '## Scheduling and error semantics', '',
    chinese ? '调度策略由显式 rpc_policy 分类，不以名称猜测只读。写任务全局 6 执行、最多 256 等待，每资源最多 32 等待；读通道最多 32 执行，含等待共 96 个，排队上限 2 秒。跨资源及未知方法使用全局屏障。排队超时表示未执行；开始后的断连不表示回滚。写请求禁止代理自动重放。' : 'An explicit rpc_policy classifies scheduling; names do not prove read-only behavior. Writes share 6 execution slots and at most 256 waiters, with at most 32 waiters per resource. Reads have 32 execution slots, at most 96 admitted requests including waiters, and a 2-second queue deadline. Cross-resource and unknown methods use a global barrier. Queue timeout means not executed; disconnection after execution begins does not imply rollback. Proxies must not replay writes.', '',
    chinese ? '## 维护依据' : '## Maintenance sources', '',
    '- [Typed clients](../../../frontend/src/lib/api/)',
    '- [Web mapping](../../../frontend/src/lib/api/transport-web-commands.ts)',
    '- [Native registry](../../../backend/desktop/src/commands/registry.rs)',
    '- [RPC policy](../../../backend/service/src/http/rpc_policy.rs)', '',
    chinese ? '执行 node scripts/generate-interface-docs.mjs 同时更新两种语言；随后运行仓库文档检查。' : 'Run node scripts/generate-interface-docs.mjs to update both languages, then run the repository documentation check.', '');
  writeFileSync(target, lines.join('\n'));
}
console.log(`Generated paired interface references for ${methods.size} dispatched methods.`);
