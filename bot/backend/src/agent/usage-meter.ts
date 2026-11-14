interface Sample { id:number; bot:string; start:number; first?:number; at:number; tokens:number; rate?:number; kind:'stream'|'request'; finished:boolean }
/** Numeric usage only. Request bodies, text and credentials are never retained here. */
export class UsageMeter {
  private samples=new Map<number,Sample>();
  start(id:number,bot:string,at=Date.now()) {
    for(const [key,s] of this.samples) if(at-s.at>60_000) this.samples.delete(key);
    if(this.samples.size>=256)this.samples.delete(this.samples.keys().next().value!);
    this.samples.set(id,{id,bot,start:at,at,tokens:0,kind:'request',finished:false});
  }
  observe(id:number,event:any,at=Date.now()) {
    const sample=this.samples.get(id);if(!sample)return;
    if(event?.choices?.some((c:any)=>c.delta?.content || c.message?.content) || event?.type==='response.output_text.delta' || event?.delta?.type==='text_delta')sample.first ??= at;
    const usage=event?.usage || event?.response?.usage || event?.message?.usage;
    const tokens=usage?.completion_tokens ?? usage?.output_tokens;
    if(typeof tokens!=='number' || !Number.isFinite(tokens) || tokens<0 || tokens===sample.tokens)return;
    const elapsed=at-(sample.first && at-sample.first>=100?sample.first:sample.start);
    if(elapsed>=100) { sample.rate=tokens*1000/elapsed;sample.kind=sample.tokens>0?'stream':'request'; }
    sample.tokens=tokens;sample.at=at;
  }
  finish(id:number) { const sample=this.samples.get(id);if(sample)sample.finished=true; }
  snapshot(now=Date.now()) {
    const rows=[...this.samples.values()].filter(s=>s.rate!==undefined && now>=s.at && now-s.at<60_000);
    const active=rows.filter(s=>!s.finished);
    const latest=new Map<string,Sample>();
    for(const sample of rows)if(!latest.has(sample.bot) || latest.get(sample.bot)!.at<sample.at)latest.set(sample.bot,sample);
    const selected=active.length?active:[...latest.values()];
    const at=selected.length?Math.max(...selected.map(s=>s.at)):undefined;
    return {tokensPerSecond:selected.length?selected.reduce((sum,s)=>sum+s.rate!,0):null,rateUpdatedAt:at,rateStale:at!==undefined&&now-at>=15_000,rateKind:selected.every(s=>s.kind==='stream')?'stream':'request'};
  }
  reader(id:number,stream:boolean) {
    const decoder=new TextDecoder();let buffer='';
    return {
      push:(chunk:Uint8Array)=>{
        buffer+=decoder.decode(chunk,{stream:true});
        if(buffer.length>1_048_576){buffer='';return;}
        if(!stream)return;
        let end:number;
        while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line.startsWith('data:'))continue;try{this.observe(id,JSON.parse(line.slice(5).trim()));}catch{/* Non-JSON SSE keepalive / [DONE]. */}}
      },
      end:()=>{if(!stream){try{this.observe(id,JSON.parse(buffer));}catch{/* Truncated/non-JSON responses do not become usage. */}}this.finish(id);buffer='';}
    };
  }
}
