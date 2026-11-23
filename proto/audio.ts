/** 音效：全部用 WebAudio 现场合成，不需要音频文件。连锁每一跳音调升高一级（五声音阶）。 */
const PENTA = [0, 2, 4, 7, 9];

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  private lastHit = 0;

  /** 浏览器要求第一次点击之后才能出声。 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 1): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }

  /** 连锁第 n 跳：音调一级一级往上走，最多三个八度。 */
  hop(n: number): void {
    const i = Math.min(n - 1, 15);
    const semi = Math.floor(i / 5) * 12 + PENTA[i % 5];
    const f = 330 * Math.pow(2, semi / 12);
    this.tone(f, 0.16, 'triangle', 0.22);
    this.tone(f * 2, 0.08, 'sine', 0.08);
    this.noise(0.12, 0.25, 900);
  }

  hit(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHit < 0.05) return;
    this.lastHit = now;
    this.tone(180 + Math.random() * 40, 0.05, 'square', 0.03);
  }

  coin(): void {
    this.tone(1320, 0.07, 'square', 0.035);
    this.tone(1760, 0.09, 'square', 0.03, 0.05);
  }

  swish(): void {
    this.noise(0.25, 0.35, 2400, 2);
    this.tone(220, 0.25, 'sine', 0.12, 0, 0.5);
  }

  start(): void {
    this.noise(0.2, 0.4, 400);
    this.tone(110, 0.3, 'sine', 0.3, 0, 0.5);
  }

  finish(hops: number): void {
    const base = hops >= 30 ? 523 : hops >= 15 ? 440 : 392;
    [0, 4, 7, 12].forEach((s, i) => this.tone(base * Math.pow(2, s / 12), 0.35, 'triangle', 0.16, i * 0.07));
    this.noise(0.4, 0.3, 300);
  }

  bad(): void {
    this.tone(200, 0.5, 'sawtooth', 0.12, 0, 0.5);
  }
}
