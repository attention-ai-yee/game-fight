/**
 * 可设种子的随机数（mulberry32）。状态是一个整数，可以存进存档，
 * 方便复现问题和写确定性的单元测试。
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 的整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 按权重选一项，items 为 [值, 权重]。 */
  weighted<T>(items: [T, number][]): T {
    let total = 0;
    for (const it of items) total += it[1];
    let x = this.next() * total;
    for (const it of items) {
      x -= it[1];
      if (x < 0) return it[0];
    }
    return items[items.length - 1][0];
  }

  /** 从 n 个下标里不重复地选 k 个。 */
  sample(n: number, k: number): number[] {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = idx[i];
      idx[i] = idx[j];
      idx[j] = tmp;
    }
    return idx.slice(0, Math.min(k, n));
  }
}
