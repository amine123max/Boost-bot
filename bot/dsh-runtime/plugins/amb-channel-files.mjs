// Boost channel file tools. MIT, part of Boost.
import { defineTool } from '@deepseek-ai/dsh-tools'
export const name = 'amb-channel-files'
export const inject = ['tools']
export function apply(ctx) {
  const url=process.env.AMB_BRIDGE_URL, token=process.env.AMB_BRIDGE_TOKEN
  if (!url || !token) return
  const output={schema:{type:'object',additionalProperties:false,properties:{text:{type:'string',required:true}}},render:(_args,value)=>[{type:'text',text:value.text}]}
  const register=(name,op,description,parameters)=>ctx.tools.register(defineTool({name,description,parameters,output,execute:async(args,exec)=>{
    const res=await fetch(url+'/dsh/channel-file',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({botId:process.env.AMB_BOT_ID,sessionId:String(exec.agent?.session?.id || ''),op,args}),signal:exec.signal})
    if (!res.ok) throw new Error(`File delivery bridge HTTP ${res.status}`)
    const result=await res.json();if(result.error)throw new Error(result.error)
    return {text:JSON.stringify(result)}
  }}))
  register('channel_list_conversations','list','List this Bot’s existing external channel conversations, such as Feishu and WeChat. Use only to find the destination requested by the user. Does not expose other Bots or private conversation text.',{})
  register('channel_send_file','file','Push a document or analysis report from your workspace to an existing channel conversation ONLY when the user explicitly asks to send it. Do not guess recipients; ask when ambiguous. Files are queued using existing authentication, quotas and retry rules. A queued result is not a delivery receipt. For replying to the current chat, use present instead.',{
    conversation_id:{type:'string',required:true},path:{type:'string',required:true,description:'Workspace-relative document/report path, at most 20 MB; executable files are refused.'},request_id:{type:'string',required:true,description:'Stable 8–100-character idempotency key; reuse unchanged when retrying.'}
  })
}
