import type { Input } from '../core/Input';
import { distanceToSegment, type Vec2 } from '../core/math';
import type { WeaponDef } from '../data/types';
import type { Diver } from '../entities/Diver';
import type { Fish } from '../entities/Fish';
import type { Particles } from '../entities/Particles';
import type { Terrain } from '../world/Terrain';

export class Projectile {
  readonly pos: Vec2;
  readonly prev: Vec2;
  readonly vel: Vec2;
  traveled = 0;
  alive = true;

  constructor(
    readonly weapon: WeaponDef,
    x: number,
    y: number,
    readonly angle: number,
    readonly damage: number,
    readonly range: number,
  ) {
    const speed = weapon.speed ?? 900;
    this.pos = { x, y };
    this.prev = { x, y };
    this.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  }

  update(dt: number): void {
    this.prev.x = this.pos.x;
    this.prev.y = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.traveled += Math.hypot(this.vel.x, this.vel.y) * dt;
    if (this.traveled >= this.range) this.alive = false;
  }
}

export interface Effect {
  kind: 'net' | 'zap' | 'slash';
  x: number;
  y: number;
  t: number;
  maxT: number;
  radius: number;
  angle: number;
  points: Vec2[];
}

/** 무기 시스템이 다이브 씬에 요구하는 것 */
export interface CombatHost {
  readonly fish: readonly Fish[];
  readonly diver: Diver;
  readonly particles: Particles;
  readonly terrain: Terrain;
  readonly pxPerMeter: number;
  readonly damageMultiplier: number;
  onFishKilled(fish: Fish): void;
  onFishCaptured(fish: Fish): void;
  notify(text: string, color?: string): void;
}

const MELEE_MAX_HITS = 3;
const SWITCH_DELAY = 0.25;

/**
 * 장착 무기(최대 2슬롯), 탄약, 발사체, 타격 판정.
 * 무기 종류: projectile(작살/3연발/전기 작살), melee(작살창), net(그물총).
 * Unity: WeaponController + WeaponDef ScriptableObject, 발사체는 오브젝트 풀링.
 */
export class WeaponSystem {
  current = 0;
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  private readonly ammo = new Map<string, number>();
  private emptyNoticeCooldown = 0;

  constructor(readonly slots: readonly WeaponDef[]) {
    for (const w of slots) this.ammo.set(w.id, w.ammo);
  }

  get weapon(): WeaponDef {
    return this.slots[this.current];
  }

  /** -1이면 무제한 */
  ammoOf(id: string): number {
    return this.ammo.get(id) ?? 0;
  }

  /** 제한 탄약 무기를 최대치의 fraction만큼 보충. 보충된 무기가 있으면 true */
  refillAmmo(fraction: number): boolean {
    let refilled = false;
    for (const w of this.slots) {
      if (w.ammo < 0) continue;
      const now = this.ammoOf(w.id);
      const next = Math.min(w.ammo, now + Math.ceil(w.ammo * fraction));
      if (next > now) refilled = true;
      this.ammo.set(w.id, next);
    }
    return refilled;
  }

  handleInput(input: Input, host: CombatHost, canFire: boolean): void {
    if (this.slots.length > 1) {
      let next = this.current;
      if (input.wasPressed('Digit1', 'Numpad1')) next = 0;
      if (input.wasPressed('Digit2', 'Numpad2')) next = 1;
      if (input.wasPressed('KeyQ') || input.wheel !== 0) next = (this.current + 1) % this.slots.length;
      if (next !== this.current && next < this.slots.length) {
        this.current = next;
        host.diver.reloadTimer = Math.max(host.diver.reloadTimer, SWITCH_DELAY);
        host.notify(`무기 전환: ${this.weapon.name}`, '#d8f3ff');
      }
    }
    if (canFire && input.mouseDown && host.diver.reloadTimer <= 0) this.fire(host);
  }

  private fire(host: CombatHost): void {
    const w = this.weapon;
    const ammo = this.ammoOf(w.id);
    if (ammo === 0) {
      if (this.emptyNoticeCooldown <= 0) {
        host.notify(`${w.name} 탄약이 없다! (Q로 무기 전환)`, '#ffd27a');
        this.emptyNoticeCooldown = 1.5;
      }
      return;
    }
    if (ammo > 0) this.ammo.set(w.id, ammo - 1);

    const diver = host.diver;
    diver.reloadTimer = w.reload;
    const damage = w.damage * host.damageMultiplier;

    if (w.type === 'melee') {
      this.melee(w, damage, host);
      return;
    }
    const tip = diver.gunTip();
    const n = w.projectiles ?? 1;
    const spread = w.spread ?? 0;
    for (let i = 0; i < n; i++) {
      const offset = n > 1 ? (i / (n - 1) - 0.5) * spread : 0;
      this.projectiles.push(new Projectile(w, tip.x, tip.y, diver.aimAngle + offset, damage, w.rangeM * host.pxPerMeter));
    }
    host.particles.burst(tip.x, tip.y, 'rgba(230,248,255,0.8)', 4, 60, 'puff');
  }

  private melee(w: WeaponDef, damage: number, host: CombatHost): void {
    const diver = host.diver;
    const reach = w.rangeM * host.pxPerMeter + diver.radius;
    const halfArc = (w.arc ?? 1) / 2;
    diver.thrustTimer = 0.18;
    this.effects.push({ kind: 'slash', x: diver.pos.x, y: diver.pos.y, t: 0, maxT: 0.22, radius: reach, angle: diver.aimAngle, points: [] });

    let hits = 0;
    for (const f of host.fish) {
      if (f.dead || hits >= MELEE_MAX_HITS) continue;
      const dx = f.pos.x - diver.pos.x;
      const dy = f.pos.y - diver.pos.y;
      if (Math.hypot(dx, dy) - f.radius > reach) continue;
      let diff = Math.atan2(dy, dx) - diver.aimAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > halfArc) continue;
      hits++;
      host.particles.burst(f.pos.x, f.pos.y, '#ffe1e1', 10, 160);
      if (f.hit(damage, diver.pos)) host.onFishKilled(f);
    }
  }

  update(dt: number, host: CombatHost): void {
    this.emptyNoticeCooldown -= dt;
    for (const p of this.projectiles) {
      p.update(dt);
      const isNet = p.weapon.type === 'net';
      if (!host.terrain.isInside(p.pos.x, p.pos.y)) {
        p.alive = false;
        if (isNet) this.deployNet(p, host);
        else host.particles.burst(p.pos.x, p.pos.y, 'rgba(200,190,160,0.6)', 6, 80, 'puff');
        continue;
      }
      if (!p.alive) {
        if (isNet) this.deployNet(p, host);
        continue;
      }
      for (const f of host.fish) {
        if (f.dead) continue;
        if (distanceToSegment(f.pos.x, f.pos.y, p.prev.x, p.prev.y, p.pos.x, p.pos.y) > f.radius + 4) continue;
        p.alive = false;
        if (isNet) this.deployNet(p, host);
        else this.spearHit(p, f, host);
        break;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.maxT);
  }

  private spearHit(p: Projectile, target: Fish, host: CombatHost): void {
    const w = p.weapon;
    host.particles.burst(target.pos.x, target.pos.y, '#ffd6d6', 8, 140);
    if (target.hit(p.damage, host.diver.pos, w.stun ?? 0)) host.onFishKilled(target);
    if (!w.chainCount || !w.chainRadius) return;

    // 전기 작살: 가까운 생물에게 연쇄 전격
    const points: Vec2[] = [{ x: target.pos.x, y: target.pos.y }];
    const struck = new Set<Fish>([target]);
    let from: Fish = target;
    for (let i = 0; i < w.chainCount; i++) {
      let best: Fish | null = null;
      let bestD = w.chainRadius;
      for (const f of host.fish) {
        if (f.dead || struck.has(f)) continue;
        const d = Math.hypot(f.pos.x - from.pos.x, f.pos.y - from.pos.y);
        if (d < bestD) {
          best = f;
          bestD = d;
        }
      }
      if (!best) break;
      struck.add(best);
      points.push({ x: best.pos.x, y: best.pos.y });
      if (best.hit(p.damage * 0.5, from.pos, w.stun ?? 0)) host.onFishKilled(best);
      from = best;
    }
    this.effects.push({ kind: 'zap', x: target.pos.x, y: target.pos.y, t: 0, maxT: 0.3, radius: 0, angle: 0, points });
  }

  private deployNet(p: Projectile, host: CombatHost): void {
    const w = p.weapon;
    const radius = w.netRadius ?? 50;
    const captureHp = w.captureHp ?? 0;
    this.effects.push({ kind: 'net', x: p.pos.x, y: p.pos.y, t: 0, maxT: 0.6, radius, angle: p.angle, points: [] });
    let captured = 0;
    for (const f of host.fish) {
      if (f.dead) continue;
      if (Math.hypot(f.pos.x - p.pos.x, f.pos.y - p.pos.y) > radius + f.radius) continue;
      if (f.hp <= captureHp) {
        f.dead = true;
        captured++;
        host.onFishCaptured(f);
      } else {
        f.stunTimer = Math.max(f.stunTimer, 0.9);
      }
    }
    if (captured > 1) host.notify(`그물로 ${captured}마리 포획!`, '#c8f7ff');
  }
}
