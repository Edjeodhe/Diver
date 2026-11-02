import { FONT, VIEW_H, VIEW_W } from '../core/config';
import type { Game } from '../core/Game';
import { clamp, distance } from '../core/math';
import { Rng } from '../core/Random';
import type { Scene } from '../core/Scene';
import type { Database } from '../data/Database';
import type { BalanceDef, ItemDef, ModifierDef } from '../data/types';
import { Diver } from '../entities/Diver';
import { Fish, type FishContext } from '../entities/Fish';
import { Particles } from '../entities/Particles';
import { Crate, OxygenStation, Pickup, ResourceNode, WarpPoint, type CrateLoot } from '../entities/Pickups';
import { applyDiveResult, DiveSession } from '../model/DiveSession';
import { computeStats, type Stats } from '../model/Progression';
import { Camera } from '../render/Camera';
import {
  drawBoat,
  drawCrate,
  drawDiver,
  drawEffect,
  drawFish,
  drawFishStatus,
  drawItem,
  drawOxygenStation,
  drawParticles,
  drawProjectile,
  drawWarp,
  glowPoint,
} from '../render/Sprites';
import { WorldRenderer, type Light } from '../render/WorldRenderer';
import { WeaponSystem, type CombatHost } from '../systems/WeaponSystem';
import { Hud } from '../ui/Hud';
import { Terrain } from '../world/Terrain';

interface Decor {
  x: number;
  y: number;
  height: number;
  color: string;
  phase: number;
  side: number;
  kind: 'kelp' | 'coral';
}

interface Ending {
  timer: number;
  duration: number;
  success: boolean;
}

const INTERACT_RADIUS = 48;
const WARP_RADIUS = 56;
const CRATE_OPEN_TIME = 0.6;
const ELITE_MAX_SCHOOL = 2;

/**
 * 다이빙 씬 (로그라이크 런 1회).
 * 입장할 때마다 새 시드로 지형/생물/채집물/보급 상자와 "오늘의 바다" 변수를 생성한다.
 * 깊을수록 산소 소모 배율이 커지고(zones.json) 강한 생물과 정예 개체가 등장한다.
 */
export class DiveScene implements Scene, CombatHost {
  readonly fish: Fish[] = [];
  readonly diver: Diver;
  readonly particles = new Particles();
  readonly terrain: Terrain;
  readonly pxPerMeter: number;
  readonly damageMultiplier: number;

  private readonly db: Database;
  private readonly b: BalanceDef;
  private readonly stats: Stats;
  private readonly rng: Rng;
  private readonly modifier: ModifierDef;
  private readonly current: number;
  private readonly session: DiveSession;
  private readonly weapons: WeaponSystem;
  private readonly camera = new Camera();
  private readonly hud: Hud;
  private readonly world: WorldRenderer;
  private readonly fishContext: FishContext;
  private pickups: Pickup[] = [];
  private readonly nodes: ResourceNode[] = [];
  private readonly crates: Crate[] = [];
  private readonly stations: OxygenStation[] = [];
  private readonly warps: WarpPoint[] = [];
  private readonly decor: Decor[] = [];

  private time = 0;
  private bubbleTimer = 0;
  private fullWarnCooldown = 0;
  private oxygenDrain = 0;
  private wasDeep = false;
  private paused = false;
  private finished = false;
  private ending: Ending | null = null;
  private prompt: string | null = null;
  private promptProgress: number | null = null;
  private focusNode: ResourceNode | null = null;

  constructor(private readonly game: Game) {
    this.db = game.db;
    this.b = game.db.balance;
    this.pxPerMeter = this.b.pxPerMeter;
    this.stats = computeStats(game.state, game.db);
    this.damageMultiplier = this.stats.damageMultiplier;
    this.rng = new Rng((Date.now() ^ Math.imul(game.state.totalDives + 1, 2654435761)) >>> 0);
    this.modifier = this.rng.weighted(this.db.modifiers, (m) => m.weight) ?? this.db.modifiers[0];
    this.current = (this.modifier.currentForce ?? 0) * (this.rng.chance(0.5) ? 1 : -1);
    this.terrain = new Terrain(this.rng, this.b);
    this.session = new DiveSession(this.stats.maxOxygen, this.stats.cargoCapacity, this.modifier.id);
    this.weapons = new WeaponSystem(game.state.loadout.map((id) => this.db.weapon(id)));
    this.diver = new Diver(this.b.boatX + 40, 2);
    this.hud = new Hud(game.sprites);
    this.world = new WorldRenderer(this.db.zones);
    this.fishContext = {
      diver: this.diver,
      terrain: this.terrain,
      rng: this.rng,
      pxPerMeter: this.pxPerMeter,
      current: this.current,
      onAttack: (f) => this.onFishAttack(f),
    };
  }

  enter(): void {
    this.populate();
    this.camera.snap(this.diver.pos);
    this.hud.toast(`${this.game.state.day}일차 물질 — 오늘의 바다: ${this.modifier.name}`, '#bff3ff');
    this.hud.toast(this.modifier.description, 'rgba(220,240,255,0.85)');
  }

  exit(): void {}

  // ───────────────────────── 생성 ─────────────────────────

  private populate(): void {
    const { rng, terrain, b, db } = this;
    const ppm = this.pxPerMeter;
    const fishMul = this.modifier.fishMultiplier ?? 1;
    const aggressiveWeight = this.modifier.aggressiveWeight ?? 1;
    const eliteMul = this.modifier.eliteMultiplier ?? 1;

    for (let top = 2; top < b.worldDepthM - 2; top += b.bandHeightM) {
      const bottom = Math.min(b.worldDepthM - 2, top + b.bandHeightM);
      const mid = (top + bottom) / 2;
      const eligible = db.fish.filter((f) => f.depthMin <= mid && mid <= f.depthMax);
      const schools = Math.round(b.schoolsPerBand * fishMul + rng.range(-0.5, 0.5));
      for (let i = 0; i < schools; i++) {
        const def = rng.weighted(eligible, (f) => f.rarity * (f.behavior === 'aggressive' || f.behavior === 'charger' ? aggressiveWeight : 1));
        if (!def) break;
        const y = rng.range(top, bottom) * ppm;
        const left = terrain.leftWall(y) + 60;
        const right = terrain.rightWall(y) - 60;
        if (right <= left) continue;
        const x = rng.range(left, right);
        const count = rng.int(def.schoolMin, def.schoolMax);
        const eliteChance = def.schoolMax <= ELITE_MAX_SCHOOL ? b.eliteChanceAtBottom * (mid / b.worldDepthM) * eliteMul : 0;
        for (let k = 0; k < count; k++) {
          const fx = x + rng.range(-50, 50);
          const fy = Math.min(y + rng.range(-30, 30), terrain.floorY(fx) - def.radius * 1.3);
          this.fish.push(new Fish(def, fx, Math.max(12, fy), rng.chance(eliteChance), rng));
        }
      }
    }

    const resourceChance = Math.min(0.95, b.resourceChance * (this.modifier.resourceMultiplier ?? 1));
    for (const side of [-1, 1]) {
      for (let y = 3 * ppm; y < terrain.depthPx - 30; y += rng.range(b.resourceSpacingMin, b.resourceSpacingMax)) {
        if (!rng.chance(resourceChance)) continue;
        const def = this.pickItem(y / ppm);
        if (!def) continue;
        const x = side < 0 ? terrain.leftWall(y) + 3 : terrain.rightWall(y) - 3;
        this.nodes.push(new ResourceNode(def, { x, y }, side < 0 ? 0 : Math.PI));
      }
    }
    const floorRef = terrain.depthPx - b.floorNoiseAmp;
    for (let x = terrain.leftWall(floorRef) + 40; x < terrain.rightWall(floorRef) - 40; x += rng.range(70, 150)) {
      if (!rng.chance(resourceChance)) continue;
      const def = this.pickItem(b.worldDepthM - 1);
      if (def) this.nodes.push(new ResourceNode(def, { x, y: terrain.floorY(x) + 3 }, -Math.PI / 2));
    }

    const hasLimitedAmmo = this.weapons.slots.some((w) => w.ammo > 0);
    for (let i = 0; i < b.cratesPerDive; i++) {
      const m = 10 + ((i + rng.next()) / b.cratesPerDive) * (b.worldDepthM - 25);
      const y = m * ppm;
      const x = rng.range(terrain.leftWall(y) + 50, terrain.rightWall(y) - 50);
      const table: CrateLoot[] = hasLimitedAmmo ? ['oxygen', 'oxygen', 'ammo', 'treasure'] : ['oxygen', 'oxygen', 'oxygen', 'treasure'];
      this.crates.push(new Crate({ x, y }, table[rng.int(0, table.length - 1)]));
    }

    // 산소 스테이션은 얕은 곳부터 바닥 근처까지 고르게, 워프는 30m 아래부터 배치
    for (let i = 0; i < b.oxygenStationCount; i++) {
      const m = 18 + ((i + rng.range(0.2, 0.8)) / b.oxygenStationCount) * (b.worldDepthM - 35);
      this.stations.push(new OxygenStation(this.openWaterSpot(m * ppm)));
    }
    for (let i = 0; i < b.warpCount; i++) {
      const m = 30 + ((i + rng.range(0.2, 0.8)) / b.warpCount) * (b.worldDepthM - 45);
      this.warps.push(new WarpPoint(this.openWaterSpot(m * ppm)));
    }

    for (const side of [-1, 1]) {
      for (let y = 20; y < 110 * ppm; y += rng.range(24, 60)) {
        const m = y / ppm;
        const kind = m < 60 ? 'kelp' : 'coral';
        if (kind === 'coral' && m < 25) continue;
        const x = side < 0 ? terrain.leftWall(y) : terrain.rightWall(y);
        const colors = kind === 'kelp' ? ['#3f8f4f', '#5aa35a', '#2f7a50'] : ['#ff7f9e', '#ffb36b', '#d78bff', '#ff6f61'];
        this.decor.push({ x, y, height: rng.range(30, kind === 'kelp' ? 110 : 40), color: colors[rng.int(0, colors.length - 1)], phase: rng.range(0, 6), side, kind });
      }
    }
  }

  /** 해당 깊이의 벽에서 충분히 떨어진 물속 지점 */
  private openWaterSpot(y: number): { x: number; y: number } {
    const left = this.terrain.leftWall(y) + 90;
    const right = this.terrain.rightWall(y) - 90;
    return { x: right > left ? this.rng.range(left, right) : (left + right) / 2, y };
  }

  private pickItem(depthM: number): ItemDef | null {
    const eligible = this.db.items.filter((i) => i.depthMin <= depthM && depthM <= i.depthMax);
    return this.rng.weighted(eligible, (i) => i.rarity);
  }

  // ───────────────────────── 업데이트 ─────────────────────────

  update(dt: number): void {
    if (this.finished) return;
    const input = this.game.input;
    if (!this.ending && input.wasPressed('Escape', 'KeyP')) this.paused = !this.paused;
    if (this.paused) return;

    this.time += dt;
    this.fullWarnCooldown -= dt;
    this.hud.update(dt);

    const aim = this.camera.screenToWorld(input.mouseX, input.mouseY);
    this.diver.controllable = !this.ending;
    this.diver.update(dt, input, aim, this.stats, this.b, this.terrain, this.current);
    const depthM = Math.max(0, this.diver.pos.y / this.pxPerMeter);
    this.session.recordDepth(depthM);
    this.updateOxygen(dt, depthM);

    this.weapons.handleInput(input, this, !this.ending && this.diver.pos.y > 6);
    this.weapons.update(dt, this);
    for (const f of this.fish) f.update(dt, this.fishContext);
    this.updatePickups(dt);
    for (const st of this.stations) st.cooldown = Math.max(0, st.cooldown - dt);
    this.updateInteraction(dt);
    this.updateBubbles(dt, depthM);
    this.particles.update(dt);
    // 귀환 중에는 카메라를 멈춰 잠수부가 화면 위로 떠오르는 게 보이게 한다
    if (!this.ending?.success) this.camera.follow(this.diver.pos, dt, this.terrain.depthPx);

    for (let i = this.fish.length - 1; i >= 0; i--) if (this.fish[i].dead) this.fish.splice(i, 1);

    if (this.ending) {
      this.ending.timer += dt;
      if (this.ending.timer >= this.ending.duration) this.finish(this.ending.success);
    }
  }

  private updateOxygen(dt: number, depthM: number): void {
    if (this.ending) return;
    const s = this.session;
    // 수면에서는 산소가 줄지 않지만 채워지지도 않는다 — 보충은 산소 스테이션/보급 상자, 아니면 배로 귀환
    if (depthM < 0.8) {
      this.oxygenDrain = 0;
      if (this.wasDeep) {
        this.hud.toast('호오이— 숨비소리. [E]로 배에 돌아갈 수 있다', '#bff3ff');
        this.wasDeep = false;
      }
      return;
    }
    let drain = this.b.oxygenDrainPerSec * this.db.oxygenMultiplierAt(depthM);
    if (this.diver.boosting) drain += this.b.boostDrainPerSec;
    if (depthM > this.stats.depthLimit) {
      drain += this.b.overDepthDrainPerSec;
      this.camera.shake = Math.max(this.camera.shake, 1.5);
    }
    this.oxygenDrain = drain;
    s.changeOxygen(-drain * dt);
    if (depthM > 15) this.wasDeep = true;
    if (s.oxygen <= 0) this.beginEnding(false);
  }

  private updateBubbles(dt: number, depthM: number): void {
    this.bubbleTimer -= dt;
    if (depthM < 0.5 || this.bubbleTimer > 0) return;
    const head = { x: this.diver.pos.x + Math.cos(this.diver.bodyAngle) * 16, y: this.diver.pos.y + Math.sin(this.diver.bodyAngle) * 16 - 4 };
    this.particles.bubble(head.x, head.y, 1.5 + Math.random() * 2);
    this.bubbleTimer = this.diver.boosting ? 0.1 : 0.3 + Math.random() * 0.4;
  }

  private updatePickups(dt: number): void {
    for (const p of this.pickups) {
      const can = this.session.canCarry(p.weight);
      if (!p.update(dt, this.diver, can, this.b.pickupMagnetRadius, this.terrain)) continue;
      if (can) {
        this.session.addCargo({ id: p.itemId, weight: p.weight, value: p.value, elite: p.elite });
        p.collected = true;
        const c = this.db.catchable(p.itemId);
        this.hud.toast(`+ ${p.elite ? '★정예 ' : ''}${c.name} (${p.weight}kg)`, p.elite ? '#ffd65a' : '#c8f7ff');
        this.particles.burst(p.pos.x, p.pos.y, 'rgba(200,250,255,0.9)', 6, 70);
      } else if (this.fullWarnCooldown <= 0) {
        this.hud.toast(`망사리가 가득 찼다! (${this.db.catchable(p.itemId).name} ${p.weight}kg)`, '#ffd27a');
        this.fullWarnCooldown = 2.5;
      }
    }
    this.pickups = this.pickups.filter((p) => !p.collected);
  }

  private updateInteraction(dt: number): void {
    const input = this.game.input;
    this.prompt = null;
    this.promptProgress = null;
    this.focusNode = null;
    if (this.ending) return;
    const diver = this.diver;

    const returnDepthM = this.b.surfaceReturnDepthM;
    if (diver.pos.y <= returnDepthM * this.pxPerMeter && this.session.maxDepthM > returnDepthM) {
      this.prompt = '[E] 배로 돌아가기 (수확물 정산)';
      if (input.wasPressed('KeyE', 'Space')) this.beginEnding(true);
      return;
    }

    if (this.nearest(this.warps, WARP_RADIUS)) {
      this.prompt = '[E] 배로 돌아가기 (워프)';
      if (input.wasPressed('KeyE')) this.beginEnding(true);
      return;
    }

    const station = this.nearest(this.stations);
    if (station) {
      const amount = this.b.oxygenStationAmount;
      if (!station.ready) this.prompt = `산소 재충전 중… ${Math.ceil(station.cooldown)}초`;
      else if (this.session.oxygen >= this.session.maxOxygen - 0.5) this.prompt = '산소가 가득 차 있다';
      else {
        this.prompt = `[E] 산소 보충 (+${amount})`;
        if (input.wasPressed('KeyE')) {
          this.session.changeOxygen(amount);
          station.cooldown = this.b.oxygenStationCooldown;
          this.hud.toast(`산소 스테이션! 산소 +${amount}`, '#5fe0c8');
          this.particles.burst(station.pos.x, station.pos.y - 20, 'rgba(200,255,240,0.9)', 12, 90);
        }
      }
      return;
    }

    const crate = this.nearest(this.crates.filter((c) => !c.opened));
    if (crate) {
      this.prompt = '[E] 보급 상자 열기';
      if (input.isDown('KeyE')) {
        crate.progress += dt;
        this.promptProgress = crate.progress / CRATE_OPEN_TIME;
        if (crate.progress >= CRATE_OPEN_TIME) this.openCrate(crate);
      } else crate.progress = 0;
      return;
    }

    const node = this.nearest(this.nodes.filter((n) => !n.harvested));
    if (!node) return;
    this.focusNode = node;
    const def = node.def;
    if (!this.session.canCarry(def.weight)) {
      this.prompt = `망사리가 가득 찼다 (${def.name} ${def.weight}kg)`;
      node.progress = 0;
      return;
    }
    this.prompt = `[E] 채집 — ${def.name}`;
    if (input.isDown('KeyE')) {
      node.progress += dt;
      this.promptProgress = node.progress / def.harvestTime;
      if (node.progress >= def.harvestTime) {
        node.harvested = true;
        const value = Math.round(def.value * (this.modifier.valueMultiplier ?? 1));
        this.session.addCargo({ id: def.id, weight: def.weight, value, elite: false });
        this.hud.toast(`+ ${def.name} (${def.weight}kg)`, '#c8f7ff');
        this.particles.burst(node.pos.x, node.pos.y, 'rgba(200,250,255,0.9)', 8, 80);
      }
    } else node.progress = Math.max(0, node.progress - dt * 2);
  }

  private nearest<T extends { pos: { x: number; y: number } }>(list: T[], radius = INTERACT_RADIUS): T | null {
    let best: T | null = null;
    let bestD = radius;
    for (const item of list) {
      const d = distance(item.pos, this.diver.pos);
      if (d < bestD) {
        best = item;
        bestD = d;
      }
    }
    return best;
  }

  private openCrate(crate: Crate): void {
    crate.opened = true;
    const depthM = crate.pos.y / this.pxPerMeter;
    this.particles.burst(crate.pos.x, crate.pos.y, 'rgba(255,230,150,0.9)', 14, 120);
    switch (crate.loot) {
      case 'oxygen': {
        const amount = Math.round(this.b.crateOxygenBase + (depthM / 100) * this.b.crateOxygenPer100m);
        this.session.changeOxygen(amount);
        this.hud.toast(`보조 산소통! 산소 +${amount}`, '#5fe0c8');
        break;
      }
      case 'ammo':
        if (this.weapons.refillAmmo(0.5)) this.hud.toast('탄약 보충!', '#ffe66d');
        else {
          this.session.changeOxygen(this.b.crateOxygenBase);
          this.hud.toast(`탄약이 가득해 산소통을 챙겼다. 산소 +${this.b.crateOxygenBase}`, '#5fe0c8');
        }
        break;
      case 'treasure': {
        const pearl = this.db.itemDef('pearl');
        if (pearl) {
          const value = Math.round(pearl.value * (this.modifier.valueMultiplier ?? 1));
          this.pickups.push(new Pickup(pearl.id, pearl.weight, value, false, crate.pos.x, crate.pos.y - 10));
          this.hud.toast('상자 안에서 진주가 나왔다!', '#ffd65a');
        }
        break;
      }
    }
  }

  // ───────────────────────── CombatHost ─────────────────────────

  onFishKilled(f: Fish): void {
    this.session.kills++;
    this.spawnCatch(f);
    this.camera.shake = Math.max(this.camera.shake, f.radius > 25 ? 6 : 2);
  }

  onFishCaptured(f: Fish): void {
    this.spawnCatch(f);
    this.particles.burst(f.pos.x, f.pos.y, 'rgba(240,240,240,0.8)', 6, 60, 'puff');
  }

  notify(text: string, color?: string): void {
    this.hud.toast(text, color);
  }

  private spawnCatch(f: Fish): void {
    this.session.discover(f.def.id);
    const value = Math.round(f.value * (this.modifier.valueMultiplier ?? 1));
    this.pickups.push(new Pickup(f.def.id, f.def.weight, value, f.elite, f.pos.x, f.pos.y));
    this.particles.burst(f.pos.x, f.pos.y, 'rgba(255,180,180,0.7)', 10, 90, 'puff');
  }

  private onFishAttack(f: Fish): void {
    if (this.ending || this.diver.hurtTimer > 0) return;
    this.session.changeOxygen(-f.damage);
    this.diver.hurtTimer = this.b.invulnTime;
    this.diver.knockback(f.pos, 280);
    this.camera.shake = 8;
    this.particles.burst(this.diver.pos.x, this.diver.pos.y, '#ff6b6b', 12, 150);
    this.hud.toast(`${f.def.name}의 공격! 산소 -${f.damage}`, '#ff9a9a');
    if (this.session.oxygen <= 0) this.beginEnding(false);
  }

  // ───────────────────────── 종료 ─────────────────────────

  private beginEnding(success: boolean): void {
    if (this.ending) return;
    this.ending = { timer: 0, duration: success ? this.b.returnFadeTime : 2.6, success };
    if (success) {
      // 귀환 연출: 위로 떠오르며 암전 → 배 화면에서 다시 밝아진다(BoatScene)
      this.diver.floatSpeed = this.b.returnFloatSpeed;
      this.diver.vel.y = Math.min(this.diver.vel.y, -this.b.returnFloatSpeed * 0.6);
      this.hud.toast('배로 돌아간다…', '#bff3ff');
    } else this.hud.toast('산소가 바닥났다… 의식이 흐려진다', '#ff8080');
  }

  private finish(success: boolean): void {
    if (this.finished) return;
    this.finished = true;
    const state = this.game.state;
    const result = this.session.toResult(success, state.codex);
    applyDiveResult(state, result);
    this.game.lastDiveResult = result;
    this.game.save();
    this.game.loadScene('boat');
  }

  // ───────────────────────── 렌더 ─────────────────────────

  render(ctx: CanvasRenderingContext2D): void {
    const cam = this.camera;
    const atlas = this.game.sprites;
    const ppm = this.pxPerMeter;
    const t = this.time;
    const depthM = Math.max(0, this.diver.pos.y / ppm);
    const camDepth = Math.max(0, cam.y / ppm);

    this.world.drawBackground(ctx, cam, ppm);
    ctx.save();
    cam.apply(ctx);
    this.world.drawLightRays(ctx, cam, t);
    this.drawDecor(ctx);
    this.world.drawTerrain(ctx, this.terrain, cam, ppm);

    for (const n of this.nodes) {
      if (n.harvested || !cam.isVisible(n.pos.x, n.pos.y, 40)) continue;
      ctx.save();
      ctx.translate(n.pos.x, n.pos.y);
      ctx.rotate(n.normal + Math.PI / 2);
      drawItem(ctx, atlas, n.def, t);
      ctx.restore();
      if (n === this.focusNode) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(n.pos.x, n.pos.y, 18 + Math.sin(t * 6) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    for (const c of this.crates) if (!c.opened && cam.isVisible(c.pos.x, c.pos.y, 40)) drawCrate(ctx, atlas, c, t);
    const cooldown = this.b.oxygenStationCooldown;
    for (const st of this.stations) {
      if (cam.isVisible(st.pos.x, st.pos.y, 40)) drawOxygenStation(ctx, atlas, st, 1 - st.cooldown / cooldown, t);
    }
    for (const w of this.warps) if (cam.isVisible(w.pos.x, w.pos.y, 60)) drawWarp(ctx, atlas, w, t);
    for (const p of this.pickups) {
      if (!cam.isVisible(p.pos.x, p.pos.y, 60)) continue;
      const fishDef = this.db.fishDef(p.itemId);
      const bob = Math.sin(p.t * 2) * 2;
      if (fishDef) {
        ctx.save();
        ctx.translate(p.pos.x, p.pos.y + bob);
        ctx.scale(1, -1); // 잡힌 물고기는 배를 뒤집는다
        drawFish(ctx, atlas, { def: fishDef, radius: Math.min(fishDef.radius, 22), facing: 1, anim: 0, flash: 0, elite: p.elite }, 0, 0);
        ctx.restore();
      } else {
        const item = this.db.itemDef(p.itemId);
        if (item) {
          ctx.save();
          ctx.translate(p.pos.x, p.pos.y + bob + 8);
          drawItem(ctx, atlas, item, t);
          ctx.restore();
        }
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + Math.sin(p.t * 5) * 0.2})`;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y + bob, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of this.fish) {
      if (!cam.isVisible(f.pos.x, f.pos.y, f.radius * 3)) continue;
      const shake = f.chargeState === 'windup' ? Math.sin(t * 60) * 2 : 0;
      drawFish(ctx, atlas, f, f.pos.x + shake, f.pos.y);
      drawFishStatus(ctx, f, t);
    }
    const tip = this.diver.gunTip();
    for (const p of this.weapons.projectiles) drawProjectile(ctx, atlas, p, tip);
    drawDiver(ctx, atlas, this.diver, this.weapons.weapon, t);
    for (const e of this.weapons.effects) drawEffect(ctx, e);
    drawParticles(ctx, this.particles.list);
    drawBoat(ctx, atlas, this.b.boatX, 0, t);
    this.world.drawSurface(ctx, cam, t);
    ctx.restore();

    this.world.drawSnow(ctx, cam, t, camDepth);
    const darkness = Math.min(0.96, clamp((camDepth - 8) / 130, 0, 0.93) + (camDepth > 5 ? this.modifier.darknessBonus ?? 0 : 0));
    this.world.drawLighting(ctx, cam, darkness, this.collectLights());
    this.drawVignettes(ctx, depthM, t);

    this.hud.draw(
      ctx,
      {
        oxygen: this.session.oxygen,
        maxOxygen: this.session.maxOxygen,
        oxygenDrain: this.oxygenDrain,
        cargoWeight: this.session.cargoWeight,
        capacity: this.session.capacity,
        cargoValue: this.session.cargoValue,
        depthM,
        depthLimitM: this.stats.depthLimit,
        worldDepthM: this.b.worldDepthM,
        bestDepthM: this.game.state.bestDepthM,
        zoneName: this.db.zoneAt(depthM).name,
        modifierName: this.modifier.name,
        weapons: this.weapons.slots.map((w, i) => ({ def: w, ammo: this.weapons.ammoOf(w.id), active: i === this.weapons.current })),
        reload: this.weapons.weapon.reload > 0 ? clamp(this.diver.reloadTimer / this.weapons.weapon.reload, 0, 1) : 0,
        prompt: this.prompt,
        progress: this.promptProgress,
        mouseX: this.game.input.mouseX,
        mouseY: this.game.input.mouseY,
        showHelp: this.time < 15 && this.game.state.totalDives < 3,
      },
      t,
    );

    if (this.ending) {
      const k = clamp(this.ending.timer / this.ending.duration, 0, 1);
      ctx.fillStyle = `rgba(0,0,0,${this.ending.success ? k * k * (3 - 2 * k) : k})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.paused) {
      ctx.fillStyle = 'rgba(0,10,20,0.6)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold 28px ${FONT}`;
      ctx.fillText('일시정지', VIEW_W / 2, VIEW_H / 2 - 16);
      ctx.font = `14px ${FONT}`;
      ctx.fillText('Esc를 눌러 계속', VIEW_W / 2, VIEW_H / 2 + 18);
    }
  }

  private collectLights(): Light[] {
    const scale = this.modifier.lightScale ?? 1;
    const lights: Light[] = [{ x: this.diver.pos.x, y: this.diver.pos.y, radius: 240 * scale, intensity: 1 }];
    for (const f of this.fish) {
      if (!f.def.glow || !this.camera.isVisible(f.pos.x, f.pos.y, 80)) continue;
      const g = glowPoint(f);
      lights.push({ x: g.x, y: g.y, radius: f.def.shape === 'angler' ? 70 : 34, intensity: 0.85 });
    }
    for (const n of this.nodes) {
      if (!n.harvested && n.def.id === 'pearl' && this.camera.isVisible(n.pos.x, n.pos.y, 40)) {
        lights.push({ x: n.pos.x, y: n.pos.y, radius: 36, intensity: 0.7 });
      }
    }
    for (const c of this.crates) {
      if (!c.opened && this.camera.isVisible(c.pos.x, c.pos.y, 40)) lights.push({ x: c.pos.x, y: c.pos.y, radius: 40, intensity: 0.5 });
    }
    for (const st of this.stations) {
      if (this.camera.isVisible(st.pos.x, st.pos.y, 50)) lights.push({ x: st.pos.x, y: st.pos.y, radius: 46, intensity: st.ready ? 0.7 : 0.35 });
    }
    for (const w of this.warps) {
      if (this.camera.isVisible(w.pos.x, w.pos.y, 70)) lights.push({ x: w.pos.x, y: w.pos.y, radius: 70, intensity: 0.85 });
    }
    return lights;
  }

  private drawDecor(ctx: CanvasRenderingContext2D): void {
    const t = this.time;
    ctx.lineCap = 'round';
    for (const d of this.decor) {
      if (!this.camera.isVisible(d.x, d.y, d.height + 20)) continue;
      if (d.kind === 'kelp') {
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        const tipX = d.x - d.side * d.height * 0.3 + Math.sin(t * 1.2 + d.phase) * 10;
        ctx.quadraticCurveTo(d.x - d.side * d.height * 0.15, d.y - d.height * 0.5, tipX, d.y - d.height);
        ctx.stroke();
      } else {
        ctx.fillStyle = d.color;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(d.x - d.side * (4 + i * 5), d.y - i * d.height * 0.2, 4 + (i % 2) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawVignettes(ctx: CanvasRenderingContext2D, depthM: number, t: number): void {
    const over = depthM > this.stats.depthLimit;
    const low = this.session.oxygen / this.session.maxOxygen < 0.25;
    if (!over && !low) return;
    const pulse = 0.5 + Math.sin(t * (over ? 8 : 4)) * 0.5;
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.65);
    g.addColorStop(0, 'rgba(120,0,0,0)');
    g.addColorStop(1, `rgba(150,10,20,${0.25 + pulse * 0.25})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
