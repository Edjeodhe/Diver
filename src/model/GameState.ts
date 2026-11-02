import type { Database } from '../data/Database';

export interface CodexEntry {
  /** 배까지 가져온 개수. 0이면 발견만 하고 가져오지 못한 상태 */
  caught: number;
}

/** 저장되는 영구 진행 상태. Unity: [Serializable] class → JSON (persistentDataPath) */
export interface GameState {
  version: 1;
  day: number;
  money: number;
  upgrades: Record<string, number>;
  unlockedWeapons: string[];
  /** 장착 무기 (최대 2개, 1/2 키로 전환) */
  loadout: string[];
  codex: Record<string, CodexEntry>;
  bestDepthM: number;
  totalDives: number;
}

export const LOADOUT_SIZE = 2;

export function createNewState(db: Database): GameState {
  return {
    version: 1,
    day: 1,
    money: db.balance.startMoney,
    upgrades: Object.fromEntries(db.upgrades.map((u) => [u.id, 0])),
    unlockedWeapons: ['speargun'],
    loadout: ['speargun'],
    codex: {},
    bestDepthM: 0,
    totalDives: 0,
  };
}

/** 저장 데이터를 현재 스키마에 맞게 보정 (필드 누락/잘못된 무기 id 등) */
export function migrateState(raw: unknown, db: Database): GameState {
  const base = createNewState(db);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<GameState>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const unlocked = Array.isArray(r.unlockedWeapons) ? r.unlockedWeapons.filter((id) => db.hasWeapon(id)) : [];
  if (!unlocked.includes('speargun')) unlocked.unshift('speargun');
  const loadout = Array.isArray(r.loadout) ? r.loadout.filter((id) => unlocked.includes(id)).slice(0, LOADOUT_SIZE) : [];
  return {
    version: 1,
    day: num(r.day, base.day),
    money: num(r.money, base.money),
    upgrades: { ...base.upgrades, ...(r.upgrades ?? {}) },
    unlockedWeapons: unlocked,
    loadout: loadout.length > 0 ? loadout : ['speargun'],
    codex: r.codex && typeof r.codex === 'object' ? r.codex : {},
    bestDepthM: num(r.bestDepthM, 0),
    totalDives: num(r.totalDives, 0),
  };
}
