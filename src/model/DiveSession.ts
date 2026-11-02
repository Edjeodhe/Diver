import { clamp } from '../core/math';
import type { CodexEntry, GameState } from './GameState';

export interface CargoEntry {
  id: string;
  weight: number;
  value: number;
  elite: boolean;
}

export interface DiveResult {
  success: boolean;
  modifierId: string;
  items: Record<string, number>;
  totalValue: number;
  lostValue: number;
  maxDepthM: number;
  kills: number;
  eliteCatches: number;
  newDiscoveries: string[];
}

/** 한 번의 다이브 동안만 유지되는 상태 (로그라이크 런). 귀환/기절 시 DiveResult로 정산된다. */
export class DiveSession {
  oxygen: number;
  readonly cargo: CargoEntry[] = [];
  maxDepthM = 0;
  kills = 0;
  private readonly discovered = new Set<string>();

  constructor(
    readonly maxOxygen: number,
    readonly capacity: number,
    readonly modifierId: string,
  ) {
    this.oxygen = maxOxygen;
  }

  get cargoWeight(): number {
    let w = 0;
    for (const c of this.cargo) w += c.weight;
    return w;
  }

  get cargoValue(): number {
    let v = 0;
    for (const c of this.cargo) v += c.value;
    return v;
  }

  canCarry(weight: number): boolean {
    return this.cargoWeight + weight <= this.capacity + 1e-6;
  }

  addCargo(entry: CargoEntry): boolean {
    if (!this.canCarry(entry.weight)) return false;
    this.cargo.push(entry);
    this.discovered.add(entry.id);
    return true;
  }

  discover(id: string): void {
    this.discovered.add(id);
  }

  changeOxygen(delta: number): void {
    this.oxygen = clamp(this.oxygen + delta, 0, this.maxOxygen);
  }

  recordDepth(depthM: number): void {
    if (depthM > this.maxDepthM) this.maxDepthM = depthM;
  }

  toResult(success: boolean, codex: Record<string, CodexEntry>): DiveResult {
    const items: Record<string, number> = {};
    let eliteCatches = 0;
    for (const c of this.cargo) {
      items[c.id] = (items[c.id] ?? 0) + 1;
      if (c.elite) eliteCatches++;
    }
    const value = this.cargoValue;
    return {
      success,
      modifierId: this.modifierId,
      items: success ? items : {},
      totalValue: success ? value : 0,
      lostValue: success ? 0 : value,
      maxDepthM: this.maxDepthM,
      kills: this.kills,
      eliteCatches: success ? eliteCatches : 0,
      newDiscoveries: [...this.discovered].filter((id) => !codex[id]),
    };
  }
}

/**
 * 다이브 결과를 영구 상태에 반영.
 * 임시 정산: 아웃게임(경영) 콘텐츠가 확정되기 전까지 가져온 수확물은 귀환 즉시 감정가로 환산된다.
 */
export function applyDiveResult(state: GameState, result: DiveResult): void {
  for (const id of result.newDiscoveries) state.codex[id] ??= { caught: 0 };
  for (const [id, n] of Object.entries(result.items)) {
    const entry = (state.codex[id] ??= { caught: 0 });
    entry.caught += n;
  }
  state.money += result.totalValue;
  state.bestDepthM = Math.max(state.bestDepthM, Math.round(result.maxDepthM));
  state.totalDives += 1;
  state.day += 1;
}
