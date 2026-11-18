export interface LocalPlugin { id: string; url: string }

export function localPlugins(raw: unknown): LocalPlugin[] {
  if (!Array.isArray(raw) || raw.length > 8) throw new Error('插件最多支持 8 项');
  const ids = new Set<string>(), urls = new Set<string>();
  return raw.map(row => {
    const id = row?.id, rawUrl = row?.url;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(id) || typeof rawUrl !== 'string' ||
      !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}\/[a-zA-Z0-9/_-]*mcp\/?$/.test(rawUrl)) {
      throw new Error('插件须使用唯一的小写标识和本机 127.0.0.1 的 /mcp 地址');
    }
    const url = new URL(rawUrl).href;
    if (ids.has(id) || urls.has(url)) throw new Error('插件名称或地址重复');
    ids.add(id); urls.add(url);
    return { id, url };
  });
}

export function pluginAllowed(bot: { origin?: string; settings: { permission: string } } | undefined): boolean {
  return !!bot && bot.origin !== 'catalog' && bot.settings.permission === 'full'
    && (process.env.BOOST_BOT_HOSTED !== '1' || process.env.BOOST_BOT_ALLOW_TOOLS === '1');
}
