export const name = 'amb-local-plugin-gate'

export function apply(ctx) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    const tool = String(exec?.name ?? '')
    const match = /^mcp__boost-local-([a-z][a-z0-9-]{0,23})__/.exec(tool)
    if (!match) return next()
    let allowed = false
    try {
      const response = await fetch(process.env.AMB_BRIDGE_URL + '/dsh/task-tool', {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(3000),
        headers:{ authorization:'Bearer '+process.env.AMB_BRIDGE_TOKEN, 'content-type':'application/json' },
        body:JSON.stringify({
          botId:process.env.AMB_BOT_ID,
          sessionId:exec?.agent?.session?.id, op:'plugin-policy', args:{ plugin:match[1] },
        }),
      })
      allowed = response.ok && (await response.json()).allowed === true
    } catch {}
    if (!allowed) return { kind:'deny', reason:'Local plugins require a trusted active Boost web console.' }
    const decision = await next()
    if (decision?.kind !== 'allow') return decision
    return { kind:'ask', reason:'A custom local plugin tool requires approval.', displayReason:{zh:'调用本机插件：'+match[1],en:'Use local plugin: '+match[1]} }
  }, { prepend:true })
}
