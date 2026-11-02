import { clamp, damp, lerp, type Vec2 } from '../core/math';
import type { Rng } from '../core/Random';
import type { FishDef } from '../data/types';
import type { Terrain } from '../world/Terrain';
import type { Diver } from './Diver';

export interface FishContext {
  diver: Diver;
  terrain: Terrain;
  rng: Rng;
  pxPerMeter: number;
  current: number;
  onAttack(fish: Fish): void;
}

type ChargeState = 'none' | 'windup' | 'dash' | 'recover';

const ELITE_HP = 2.5;
const ELITE_DAMAGE = 1.5;
const ELITE_SIZE = 1.25;
const ELITE_VALUE = 2.5;
const AGGRO_RADIUS = 240;

/** 바다 생물 AI. Unity: FishController + 상태 머신 (behavior별 전략 클래스로 분리 권장) */
export class Fish {
  readonly pos: Vec2;
  readonly vel: Vec2 = { x: 0, y: 0 };
  readonly maxHp: number;
  readonly radius: number;
  hp: number;
  dead = false;
  facing = 1;
  flash = 0;
  anim: number;
  stunTimer = 0;
  chargeState: ChargeState = 'none';

  private readonly target: Vec2;
  private retargetTimer = 0;
  private fleeTimer = 0;
  private enragedTimer = 0;
  private attackCooldown = 0;
  private chargeTimer = 0;
  private readonly chargeDir: Vec2 = { x: 0, y: 0 };

  constructor(
    readonly def: FishDef,
    x: number,
    y: number,
    readonly elite: boolean,
    rng: Rng,
  ) {
    this.pos = { x, y };
    this.target = { x, y };
    this.maxHp = Math.round(def.hp * (elite ? ELITE_HP : 1));
    this.hp = this.maxHp;
    this.radius = def.radius * (elite ? ELITE_SIZE : 1);
    this.anim = rng.range(0, 10);
    this.facing = rng.chance(0.5) ? 1 : -1;
  }

  get damage(): number {
    return Math.round(this.def.damage * (this.elite ? ELITE_DAMAGE : 1));
  }

  get value(): number {
    return Math.round(this.def.value * (this.elite ? ELITE_VALUE : 1));
  }

  get isHostile(): boolean {
    return this.def.behavior === 'aggressive' || this.def.behavior === 'charger';
  }

  update(dt: number, w: FishContext): void {
    const def = this.def;
    this.flash = Math.max(0, this.flash - dt);
    this.fleeTimer = Math.max(0, this.fleeTimer - dt);
    this.enragedTimer = Math.max(0, this.enragedTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      const k = damp(4, dt);
      this.vel.x = lerp(this.vel.x, 0, k);
      this.vel.y = lerp(this.vel.y, 0, k);
      this.integrate(dt, w);
      return;
    }

    const diver = w.diver;
    const dx = diver.pos.x - this.pos.x;
    const dy = diver.pos.y - this.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const diverInWater = diver.pos.y > 8 && diver.controllable;
    const ppm = w.pxPerMeter;
    const minY = Math.max(10, (def.depthMin - 4) * ppm);
    const maxY = (def.depthMax + 4) * ppm;

    let desiredX = 0;
    let desiredY = 0;
    let speed = def.speed * 0.4;
    let steer = 3;
    const hunting = this.isHostile && diverInWater && (dist < AGGRO_RADIUS || this.enragedTimer > 0);

    if (def.behavior === 'charger' && (hunting || this.chargeState === 'dash')) {
      steer = this.updateCharge(dt, dx / dist, dy / dist, dist);
      if (this.chargeState === 'windup' || this.chargeState === 'recover') {
        speed = def.speed * 0.15;
        desiredX = dx;
        desiredY = dy;
      } else if (this.chargeState === 'dash') {
        speed = def.speed * 3;
        desiredX = this.chargeDir.x;
        desiredY = this.chargeDir.y;
      } else {
        speed = def.speed * 0.55;
        desiredX = dx;
        desiredY = dy;
      }
    } else if (this.fleeTimer > 0 || (def.behavior === 'skittish' && dist < 150 && diverInWater)) {
      desiredX = -dx;
      desiredY = -dy;
      speed = def.speed * 1.3;
    } else if (hunting) {
      if (this.attackCooldown > 0.7) {
        desiredX = -dx;
        desiredY = -dy;
        speed = def.speed * 0.7;
      } else {
        desiredX = dx;
        desiredY = dy;
        speed = def.speed;
      }
    } else {
      this.chargeState = 'none';
      this.retargetTimer -= dt;
      if (this.retargetTimer <= 0 || Math.hypot(this.target.x - this.pos.x, this.target.y - this.pos.y) < 20) {
        this.pickWanderTarget(w, minY, maxY);
      }
      desiredX = this.target.x - this.pos.x;
      desiredY = this.target.y - this.pos.y;
      if (this.pos.y < minY) desiredY += 80;
      if (this.pos.y > maxY) desiredY -= 80;
    }

    const len = Math.hypot(desiredX, desiredY);
    const tx = len > 0 ? (desiredX / len) * speed : 0;
    const ty = len > 0 ? (desiredY / len) * speed : 0;
    const k = damp(steer, dt);
    this.vel.x = lerp(this.vel.x, tx, k);
    this.vel.y = lerp(this.vel.y, ty, k);

    // 접촉 공격: 일반 공격형은 쿨다운마다, 돌진형은 돌진 중에만
    const canHit = def.behavior === 'charger' ? this.chargeState === 'dash' : hunting;
    if (canHit && diverInWater && this.attackCooldown <= 0 && dist < this.radius + diver.radius) {
      w.onAttack(this);
      this.attackCooldown = 1.4;
      if (this.chargeState === 'dash') this.enterRecover();
    }

    this.integrate(dt, w);
  }

  /** 돌진형 상태 머신. 반환값은 조향 강도 */
  private updateCharge(dt: number, nx: number, ny: number, dist: number): number {
    this.chargeTimer -= dt;
    switch (this.chargeState) {
      case 'none':
        if (this.attackCooldown <= 0 && dist < AGGRO_RADIUS) {
          this.chargeState = 'windup';
          this.chargeTimer = 0.75;
        }
        return 3;
      case 'windup':
        this.chargeDir.x = nx;
        this.chargeDir.y = ny;
        if (this.chargeTimer <= 0) {
          this.chargeState = 'dash';
          this.chargeTimer = 0.6;
        }
        return 6;
      case 'dash':
        if (this.chargeTimer <= 0) this.enterRecover();
        return 12;
      case 'recover':
        if (this.chargeTimer <= 0) this.chargeState = 'none';
        return 2;
    }
  }

  private enterRecover(): void {
    this.chargeState = 'recover';
    this.chargeTimer = 1.0;
    this.attackCooldown = Math.max(this.attackCooldown, 1.6);
  }

  private pickWanderTarget(w: FishContext, minY: number, maxY: number): void {
    const ty = clamp(this.pos.y + w.rng.range(-100, 100), minY, maxY);
    const left = w.terrain.leftWall(ty) + this.radius + 30;
    const right = w.terrain.rightWall(ty) - this.radius - 30;
    this.target.x = clamp(this.pos.x + w.rng.range(-200, 200), left, Math.max(left, right));
    this.target.y = ty;
    this.retargetTimer = w.rng.range(2, 5);
  }

  private integrate(dt: number, w: FishContext): void {
    this.anim += dt * (1.5 + Math.hypot(this.vel.x, this.vel.y) / 40);
    this.pos.x += (this.vel.x + w.current * 0.5) * dt;
    this.pos.y += this.vel.y * dt;
    if (w.terrain.collide(this.pos, this.radius, this.vel) && this.chargeState === 'dash') this.enterRecover();
    if (this.pos.y < 10) this.pos.y = 10;
    if (this.chargeState === 'windup') this.facing = w.diver.pos.x >= this.pos.x ? 1 : -1;
    else if (Math.abs(this.vel.x) > 4) this.facing = this.vel.x > 0 ? 1 : -1;
  }

  /** 피격. 사망 시 true */
  hit(damage: number, from: Vec2, stun = 0): boolean {
    if (this.dead) return false;
    this.hp -= damage;
    this.flash = 0.15;
    if (stun > 0) this.stunTimer = Math.max(this.stunTimer, stun);
    const dx = this.pos.x - from.x;
    const dy = this.pos.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const push = 140 / Math.max(1, this.radius / 14);
    this.vel.x += (dx / d) * push;
    this.vel.y += (dy / d) * push;
    if (this.isHostile) this.enragedTimer = 6;
    else this.fleeTimer = 2.5;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }
}
