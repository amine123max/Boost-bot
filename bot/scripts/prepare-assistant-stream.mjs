import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// The pinned SDK publishes only durable session events over its JSON-RPC pipe.
// Forward public text frames from its existing transient stream, scoped by session.
export function prepareAssistantStream(root) {
  const file = new URL('dsh-runtime/node_modules/@deepseek-ai/dsh-sdk-jsonrpc-server/lib/index.js', root);
  if (!existsSync(file)) return;
  const source = readFileSync(file, 'utf8');
  if (source.includes('session.publicText')) return;
  const anchor = 'this.disposers.push(ctx.on("agent/error",';
  if (source.split(anchor).length !== 2) throw new Error('DSH SDK changed; verify the public text stream adapter');
  writeFileSync(file, source.replace(anchor, `this.disposers.push(ctx.on("agent/assistant-stream", ({ agent, frame }) => {
      const chunk = frame.type === "chunk" ? frame.chunk : undefined;
      if (frame.type === "start" || chunk?.type === "text-delta") {
        this.transport.notify("session.publicText", {
          sessionId: String(agent.session.id),
          ...(chunk ? { delta: chunk.text } : { reset: true }),
        });
      }
    }));
    ${anchor}`));
}
