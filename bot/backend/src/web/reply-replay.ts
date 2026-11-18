export interface ReplyFrame {
  seq: number;
  event: string;
  data: unknown;
  bytes: number;
}

// Per turn, not per connection. The offset delta prevents retaining N copies of the reply.
const MAX_FRAMES = 256;
const MAX_BYTES = 512 * 1024;

export class ReplyReplay {
  private frames: ReplyFrame[] = [];
  private bytes = 0;
  private text = '';
  sequence = 0;

  append(event: string, data: unknown): ReplyFrame {
    if (event === 'text') {
      const { text, final } = data as { text: string; final?: boolean };
      if (text.startsWith(this.text)) {
        event = 'textDelta';
        data = { offset: this.text.length, append: text.slice(this.text.length), ...(final ? { final: true } : {}) };
      }
      this.text = text;
    } else if (event === 'interim') this.text = '';
    const frame = { seq: ++this.sequence, event, data, bytes: Buffer.byteLength(JSON.stringify(data)) };
    if (frame.bytes > MAX_BYTES) {
      // Existing subscribers still get this frame. Later subscribers use a snapshot.
      this.frames = [];
      this.bytes = 0;
      return frame;
    }
    this.frames.push(frame);
    this.bytes += frame.bytes;
    while (this.frames.length > MAX_FRAMES || this.bytes > MAX_BYTES) this.bytes -= this.frames.shift()!.bytes;
    return frame;
  }

  after(cursor: string | null): ReplyFrame[] | undefined {
    if (cursor == null || !/^\d{1,15}$/.test(cursor)) return;
    const seq = Number(cursor);
    if (seq === this.sequence) return [];
    if (seq > this.sequence || !this.frames.length || seq < this.frames[0].seq - 1) return;
    return this.frames.filter(frame => frame.seq > seq);
  }
}
