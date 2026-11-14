/** Bounded media reads; never buffer an unlimited provider response before checking its size. */
export async function readMediaBytes(stream: AsyncIterable<Uint8Array>, limit: number, declared = 0): Promise<Buffer> {
  if (declared > limit) throw Object.assign(new Error(`文件超过 ${Math.round(limit / 1048576)} MB 限制`), { fatal: true });
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const bytes of stream) {
    const chunk = Buffer.from(bytes);
    length += chunk.length;
    if (length > limit) throw Object.assign(new Error(`文件超过 ${Math.round(limit / 1048576)} MB 限制`), { fatal: true });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}
