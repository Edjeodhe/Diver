import { damp, lerp, type Vec2 } from '../core/math';
import type { ItemDef } from '../data/types';
import type { Terrain } from '../world/Terrain';
import type { Diver } from './Diver';

/** 바다에 떠 있는 획득물 (잡은 물고기 / 상자에서 나온 물건). 가까우면 잠수부에게 끌려온다. */
export class Pickup {
  readonly pos: Vec2;
  readonly vel: Vec2 = { x: 0, y: 0 };
  t = Math.random() * 10;
  collected = false;

  constructor(
    readonly itemId: string,
    readonly weight: number,
    readonly value: number,
    readonly elite: boolean,
    x: number,
    y: number,
  ) {
    this.pos = { x, y };
  }

  /** 잠수부와 닿았으면 true */
  update(dt: number, diver: Diver, canCarry: boolean, magnetRadius: number, terrain: Terrain): boolean {
    this.t += dt;
    const dx = diver.pos.x - this.pos.x;
    const dy = diver.pos.y - this.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    if (canCarry && d < magnetRadius) {
      const pull = 520 * (1 - d / magnetRadius) + 90;
      this.vel.x += (dx / d) * pull * dt;
      this.vel.y += (dy / d) * pull * dt;
    }
    const k = damp(2.5, dt);
    this.vel.x = lerp(this.vel.x, 0, k);
    this.vel.y = lerp(this.vel.y, 0, k);
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    terrain.collide(this.pos, 6, this.vel);
    if (this.pos.y < 8) this.pos.y = 8;
    return d < diver.radius + 12;
  }
}

/** 벽/해저에 붙어 있는 채집 포인트. E를 누르고 있으면 채집된다. */
export class ResourceNode {
  harvested = false;
  progress = 0;

  constructor(
    readonly def: ItemDef,
    readonly pos: Vec2,
    /** 바위 바깥을 향하는 방향(라디안) */
    readonly normal: number,
  ) {}
}

export type CrateLoot = 'oxygen' | 'ammo' | 'treasure';

/** 보급 상자. 산소/탄약/보물 중 하나가 들어 있다. */
export class Crate {
  opened = false;
  progress = 0;

  constructor(
    readonly pos: Vec2,
    readonly loot: CrateLoot,
  ) {}
}

/** 바다 곳곳의 산소 보급 스테이션. E로 일정량 충전, 쓰고 나면 재충전될 때까지 대기한다. */
export class OxygenStation {
  /** 0이면 사용 가능 */
  cooldown = 0;

  constructor(readonly pos: Vec2) {}

  get ready(): boolean {
    return this.cooldown <= 0;
  }
}

/** 워프 포인트. E로 즉시 배로 돌아간다(귀환 연출 후 정산). */
export class WarpPoint {
  constructor(readonly pos: Vec2) {}
}
