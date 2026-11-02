import type { Database } from '../data/Database';
import type { StatId, UpgradeDef, UpgradeLevel } from '../data/types';
import { LOADOUT_SIZE, type GameState } from './GameState';

export type Stats = Record<StatId, number>;

export function upgradeLevel(state: GameState, def: UpgradeDef): number {
  const lv = state.upgrades[def.id] ?? 0;
  return Math.max(0, Math.min(def.levels.length - 1, lv));
}

export function computeStats(state: GameState, db: Database): Stats {
  const stats = {} as Stats;
  for (const u of db.upgrades) stats[u.stat] = u.levels[upgradeLevel(state, u)].value;
  return stats;
}

export function nextUpgrade(state: GameState, def: UpgradeDef): UpgradeLevel | null {
  return def.levels[upgradeLevel(state, def) + 1] ?? null;
}

export function buyUpgrade(state: GameState, db: Database, upgradeId: string): boolean {
  const def = db.upgrades.find((u) => u.id === upgradeId);
  if (!def) return false;
  const next = nextUpgrade(state, def);
  if (!next || state.money < next.cost) return false;
  state.money -= next.cost;
  state.upgrades[def.id] = upgradeLevel(state, def) + 1;
  return true;
}

export function unlockWeapon(state: GameState, db: Database, weaponId: string): boolean {
  if (state.unlockedWeapons.includes(weaponId)) return false;
  const w = db.weapon(weaponId);
  if (state.money < w.cost) return false;
  state.money -= w.cost;
  state.unlockedWeapons.push(weaponId);
  if (state.loadout.length < LOADOUT_SIZE) state.loadout.push(weaponId);
  return true;
}

/** 장착/해제 토글. 최소 1개는 장착 상태 유지, 가득 차면 가장 오래된 슬롯을 교체 */
export function toggleLoadout(state: GameState, weaponId: string): void {
  if (!state.unlockedWeapons.includes(weaponId)) return;
  const idx = state.loadout.indexOf(weaponId);
  if (idx >= 0) {
    if (state.loadout.length > 1) state.loadout.splice(idx, 1);
    return;
  }
  if (state.loadout.length >= LOADOUT_SIZE) state.loadout.shift();
  state.loadout.push(weaponId);
}
