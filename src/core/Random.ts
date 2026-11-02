import { clamp, lerp, smoothstep } from './math';

/** 시드 기반 난수 (mulberry32). 다이브마다 새 시드 → 지형/생물 재배치. Unity: System.Random(seed) */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** min, max 모두 포함 */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  weighted<T>(items: readonly T[], weight: (item: T) => number): T | null {
    let total = 0;
    for (const item of items) total += Math.max(0, weight(item));
    if (total <= 0) return null;
    let r = this.next() * total;
    for (const item of items) {
      r -= Math.max(0, weight(item));
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }
}

/** 1차원 value noise. 동굴 벽/해저면 윤곽 생성용. */
export class Noise1D {
  private readonly values: number[] = [];

  constructor(
    rng: Rng,
    private readonly spacing: number,
    private readonly origin: number,
    length: number,
  ) {
    const count = Math.ceil(length / spacing) + 2;
    for (let i = 0; i < count; i++) this.values.push(rng.range(-1, 1));
  }

  sample(x: number): number {
    const u = (x - this.origin) / this.spacing;
    const i = clamp(Math.floor(u), 0, this.values.length - 2);
    const t = smoothstep(clamp(u - i, 0, 1));
    return lerp(this.values[i], this.values[i + 1], t);
  }
}
