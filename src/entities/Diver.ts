import type { Input } from '../core/Input';
import { damp, lerp, lerpAngle, type Vec2 } from '../core/math';
import type { BalanceDef } from '../data/types';
import type { Stats } from '../model/Progression';
import type { Terrain } from '../world/Terrain';

/** 플레이어 잠수부. Unity: DiverController (Rigidbody2D + CircleCollider2D) */
export class Diver {
  readonly pos: Vec2;
  readonly vel: Vec2 = { x: 0, y: 0 };
  readonly radius = 13;
  aimAngle = 0;
  bodyAngle = 0;
  reloadTimer = 0;
  hurtTimer = 0;
  /** 근접 찌르기 연출 타이머 */
  thrustTimer = 0;
  boosting = false;
  controllable = true;
  /** 조작 불가일 때 떠오르는 속도 (기절: 천천히, 귀환: 빠르게) */
  floatSpeed = 30;
  kick = 0;

  constructor(x: number, y: number) {
    this.pos = { x, y };
  }

  update(dt: number, input: Input, aim: Vec2, stats: Stats, b: BalanceDef, terrain: Terrain, current: number): void {
    this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.thrustTimer = Math.max(0, this.thrustTimer - dt);

    const ax = this.controllable ? input.axisX() : 0;
    const ay = this.controllable ? input.axisY() : 0;
    const moving = ax !== 0 || ay !== 0;
    this.boosting = moving && input.isDown('ShiftLeft', 'ShiftRight');
    const maxSpeed = stats.swimSpeed * (this.boosting ? b.boostMultiplier : 1);
    const len = Math.hypot(ax, ay) || 1;
    const k = damp(moving ? 5 : 1.8, dt);
    this.vel.x = lerp(this.vel.x, (ax / len) * maxSpeed, k);
    this.vel.y = lerp(this.vel.y, (ay / len) * maxSpeed, k);
    // 기절하거나 귀환할 때는 저절로 떠오른다
    if (!this.controllable) this.vel.y = lerp(this.vel.y, -this.floatSpeed, damp(1, dt));

    this.pos.x += (this.vel.x + (this.pos.y > 4 ? current : 0)) * dt;
    this.pos.y += this.vel.y * dt;
    terrain.collide(this.pos, this.radius, this.vel);
    if (this.pos.y < 0) {
      this.pos.y = 0;
      if (this.vel.y < 0) this.vel.y = 0;
    }

    this.aimAngle = Math.atan2(aim.y - this.pos.y, aim.x - this.pos.x);
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const target = speed > 30 ? Math.atan2(this.vel.y, this.vel.x) : Math.cos(this.aimAngle) >= 0 ? 0 : Math.PI;
    this.bodyAngle = lerpAngle(this.bodyAngle, target, damp(8, dt));
    this.kick += dt * (2 + speed / 25);
  }

  gunTip(): Vec2 {
    return { x: this.pos.x + Math.cos(this.aimAngle) * 24, y: this.pos.y + Math.sin(this.aimAngle) * 24 };
  }

  knockback(from: Vec2, force: number): void {
    const dx = this.pos.x - from.x;
    const dy = this.pos.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    this.vel.x += (dx / d) * force;
    this.vel.y += (dy / d) * force;
  }
}
