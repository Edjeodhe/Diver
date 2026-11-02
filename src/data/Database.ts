import balanceJson from './balance.json';
import fishJson from './fish.json';
import itemsJson from './items.json';
import modifiersJson from './modifiers.json';
import spritesJson from './sprites.json';
import upgradesJson from './upgrades.json';
import weaponsJson from './weapons.json';
import zonesJson from './zones.json';
import type {
  BalanceDef,
  FishDef,
  ItemDef,
  ModifierDef,
  SpriteManifest,
  StatId,
  UpgradeDef,
  WeaponDef,
  ZoneDef,
} from './types';

/** 포획/채집물 공통 정보 (물고기 + 채집물) */
export interface Catchable {
  id: string;
  name: string;
  value: number;
  weight: number;
  kind: 'fish' | 'item';
}

const ALL_STATS: StatId[] = ['maxOxygen', 'cargoCapacity', 'depthLimit', 'swimSpeed', 'damageMultiplier'];

/** 정적 게임 데이터 접근점. Unity: ScriptableObject 데이터베이스 / Addressables 로더 */
export class Database {
  readonly fish = fishJson as FishDef[];
  readonly items = itemsJson as ItemDef[];
  readonly weapons = weaponsJson as WeaponDef[];
  readonly upgrades = upgradesJson as UpgradeDef[];
  readonly zones = zonesJson as ZoneDef[];
  readonly modifiers = modifiersJson as ModifierDef[];
  readonly balance = balanceJson as BalanceDef;
  readonly sprites = spritesJson as SpriteManifest;

  private readonly catchables = new Map<string, Catchable>();
  private readonly fishById = new Map<string, FishDef>();
  private readonly itemById = new Map<string, ItemDef>();
  private readonly weaponById = new Map<string, WeaponDef>();

  constructor() {
    for (const f of this.fish) {
      this.register({ id: f.id, name: f.name, value: f.value, weight: f.weight, kind: 'fish' });
      this.fishById.set(f.id, f);
    }
    for (const i of this.items) {
      this.register({ id: i.id, name: i.name, value: i.value, weight: i.weight, kind: 'item' });
      this.itemById.set(i.id, i);
    }
    for (const w of this.weapons) this.weaponById.set(w.id, w);
    for (const stat of ALL_STATS) {
      if (!this.upgrades.some((u) => u.stat === stat)) throw new Error(`No upgrade defines stat "${stat}"`);
    }
  }

  private register(c: Catchable): void {
    if (this.catchables.has(c.id)) throw new Error(`Duplicate catchable id "${c.id}"`);
    this.catchables.set(c.id, c);
  }

  catchable(id: string): Catchable {
    const c = this.catchables.get(id);
    if (!c) throw new Error(`Unknown catchable "${id}"`);
    return c;
  }

  fishDef(id: string): FishDef | undefined {
    return this.fishById.get(id);
  }

  itemDef(id: string): ItemDef | undefined {
    return this.itemById.get(id);
  }

  weapon(id: string): WeaponDef {
    const w = this.weaponById.get(id);
    if (!w) throw new Error(`Unknown weapon "${id}"`);
    return w;
  }

  hasWeapon(id: string): boolean {
    return this.weaponById.has(id);
  }

  zoneAt(depthM: number): ZoneDef {
    for (const z of this.zones) if (depthM < z.depthMax) return z;
    return this.zones[this.zones.length - 1];
  }

  /** 구간 경계에서 부드럽게 보간된 산소 소모 배율 */
  oxygenMultiplierAt(depthM: number): number {
    const zs = this.zones;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (depthM < z.depthMax || i === zs.length - 1) {
        const next = zs[i + 1];
        if (!next) return z.oxygenMultiplier;
        const t = Math.max(0, (depthM - z.depthMin) / (z.depthMax - z.depthMin));
        return z.oxygenMultiplier + (next.oxygenMultiplier - z.oxygenMultiplier) * t;
      }
    }
    return 1;
  }
}
