/** Members can use their own conversations, but cannot execute tools on the server. */
export function memberRequestAllowed(method: string, path: string): boolean {
  const p = path.split('?')[0];
  if (method === 'GET') {
    if (p === '/activity') return true;
    return /^\/(status|models|model-info|modelflare|official|account|agent|settings|guide|update|notices|catalog|attention|needs)$/.test(p)
      || /^\/(models\/info|media\/models|approvals|tasks)$/.test(p)
      || /^\/(bots|groups)(\/[^/]+)?$/.test(p)
      || /^\/bots\/[^/]+\/(chat|chat\/live|conversations|previews|settings)$/.test(p)
      || /^\/conversations(\/[^/]+(\/messages|\/file|\/turn)?)?$/.test(p)
      || /^\/groups\/[^/]+\/(live|messages)$/.test(p);
  }
  return (method === 'POST' && /^\/(bots|groups)$/.test(p))
    || (['PUT', 'DELETE'].includes(method) && /^\/(bots|groups)\/[^/]+$/.test(p))
    || (method === 'PUT' && /^\/bots\/[^/]+\/chat\/model$/.test(p))
    || (method === 'POST' && /^\/bots\/[^/]+\/(chat(\/stream)?|clear|stop)$/.test(p))
    || (method === 'POST' && /^\/conversations\/[^/]+\/(stop|clear|model)$/.test(p))
    || (method === 'POST' && /^\/groups\/[^/]+\/(chat|stop|clear)$/.test(p));
}
