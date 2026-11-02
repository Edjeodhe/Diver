// 엔티티 드로잉. 스프라이트 이미지가 있으면 이미지를, 없으면 절차적 벡터 도형을 그린다.
// Unity 이식 시 이 파일은 SpriteRenderer + Animator로 대체된다.
import type { FishDef, FishShape, ItemDef, WeaponDef } from '../data/types';
import type { Diver } from '../entities/Diver';
import type { Fish } from '../entities/Fish';
import type { Particle } from '../entities/Particles';
import type { Crate, OxygenStation, WarpPoint } from '../entities/Pickups';
import type { Effect, Projectile } from '../systems/WeaponSystem';
import type { SpriteAtlas } from './SpriteAtlas';

const OUTLINE = '#10202c';

/** 스프라이트 폭 = 반경 × 배율 */
const SPRITE_WIDTH_FACTOR: Record<FishShape, number> = {
  fish: 3.4,
  eel: 5.0,
  shark: 4.2,
  round: 2.8,
  squid: 4.0,
  angler: 3.4,
};

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function fillStroke(ctx: CanvasRenderingContext2D, fill: string, lineWidth = 1.5): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ellipse(ctx, x, y, r, r);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ellipse(ctx, x + r * 0.25, y, r * 0.55, r * 0.55);
  ctx.fillStyle = '#111';
  ctx.fill();
}

// ───────────────────────── 물고기 ─────────────────────────

/** 실제 개체 없이(도감/획득물) 그릴 때 쓰는 최소 정보 */
export interface FishLook {
  def: FishDef;
  radius: number;
  facing: number;
  anim: number;
  flash: number;
  elite: boolean;
}

export function drawFish(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, f: FishLook, x: number, y: number): void {
  const r = f.radius;
  ctx.save();
  ctx.translate(x, y);

  if (f.elite) {
    const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2);
    g.addColorStop(0, 'rgba(255,214,90,0.45)');
    g.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  }

  ctx.scale(f.facing, 1);
  const img = atlas.get(`fish_${f.def.id}`);
  if (img) {
    ctx.rotate(Math.sin(f.anim * 2) * 0.04);
    if (f.flash > 0) ctx.filter = 'brightness(2.6)';
    const w = r * SPRITE_WIDTH_FACTOR[f.def.shape];
    const h = (w * img.naturalHeight) / img.naturalWidth;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.filter = 'none';
  } else {
    drawFishShape(ctx, f.def, r, f.anim, f.flash > 0 ? '#ffffff' : f.def.color);
  }
  ctx.restore();
}

/** 개체 상태 표시 (돌진 예고, 기절, 정예 HP바) */
export function drawFishStatus(ctx: CanvasRenderingContext2D, f: Fish, time: number): void {
  const r = f.radius;
  if (f.chargeState === 'windup') {
    ctx.fillStyle = '#ff4d4d';
    ctx.font = `bold ${Math.max(14, r * 0.7)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('!', f.pos.x, f.pos.y - r - 8 + Math.sin(time * 30) * 2);
  }
  if (f.stunTimer > 0) {
    ctx.strokeStyle = '#ffe66d';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = time * 6 + (i * Math.PI * 2) / 3;
      const sx = f.pos.x + Math.cos(a) * r * 0.8;
      const sy = f.pos.y - r - 4 + Math.sin(a) * 4;
      ctx.beginPath();
      ctx.moveTo(sx - 3, sy);
      ctx.lineTo(sx + 3, sy);
      ctx.moveTo(sx, sy - 3);
      ctx.lineTo(sx, sy + 3);
      ctx.stroke();
    }
  }
  if ((f.isHostile || f.elite) && f.hp < f.maxHp) {
    const w = Math.max(24, r * 1.6);
    const x = f.pos.x - w / 2;
    const y = f.pos.y - r - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = f.elite ? '#ffd65a' : '#ff6b6b';
    ctx.fillRect(x, y, (w * Math.max(0, f.hp)) / f.maxHp, 4);
  }
}

function drawFishShape(ctx: CanvasRenderingContext2D, def: FishDef, r: number, anim: number, body: string): void {
  const wag = Math.sin(anim * 6) * 0.35;
  switch (def.shape) {
    case 'fish': {
      // 꼬리
      ctx.save();
      ctx.translate(-r * 0.85, 0);
      ctx.rotate(wag);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-r * 0.75, -r * 0.55);
      ctx.lineTo(-r * 0.6, 0);
      ctx.lineTo(-r * 0.75, r * 0.55);
      ctx.closePath();
      fillStroke(ctx, def.finColor);
      ctx.restore();
      // 등지느러미
      ctx.beginPath();
      if (def.spiky) {
        for (let i = 0; i < 6; i++) {
          const bx = -r * 0.5 + i * r * 0.2;
          ctx.moveTo(bx, -r * 0.45);
          ctx.lineTo(bx - r * 0.15, -r * 1.25 + Math.abs(i - 2.5) * r * 0.12);
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = def.finColor;
        ctx.stroke();
      } else {
        ctx.moveTo(-r * 0.45, -r * 0.5);
        ctx.quadraticCurveTo(-r * 0.1, -r * 1.05, r * 0.35, -r * 0.5);
        ctx.closePath();
        fillStroke(ctx, def.finColor);
      }
      // 몸통
      ellipse(ctx, 0, 0, r, r * 0.62);
      fillStroke(ctx, body);
      ctx.save();
      ellipse(ctx, 0, 0, r, r * 0.62);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ellipse(ctx, r * 0.1, r * 0.4, r * 0.9, r * 0.35);
      ctx.fill();
      if (def.pattern === 'stripes') {
        ctx.fillStyle = 'rgba(20,20,20,0.42)';
        for (const sx of [-0.55, -0.15, 0.25]) ctx.fillRect(sx * r, -r, r * 0.17, r * 2);
      }
      ctx.restore();
      // 가슴지느러미
      ctx.save();
      ctx.translate(r * 0.15, r * 0.1);
      ctx.rotate(0.5 + wag * 0.5);
      ellipse(ctx, -r * 0.2, 0, r * 0.28, r * 0.12);
      fillStroke(ctx, def.finColor, 1);
      ctx.restore();
      eye(ctx, r * 0.55, -r * 0.12, Math.max(1.8, r * 0.14));
      break;
    }
    case 'eel': {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const path = () => {
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const px = r * 1.1 - i * r * 0.32;
          const py = Math.sin(anim * 5 - i * 0.7) * r * 0.3 * (i / 12);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      };
      path();
      ctx.lineWidth = r * 0.7 + 3;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      path();
      ctx.lineWidth = r * 0.7;
      ctx.strokeStyle = body;
      ctx.stroke();
      ellipse(ctx, r * 1.15, 0, r * 0.5, r * 0.38);
      fillStroke(ctx, body);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(r * (1.35 + i * 0.1), r * 0.08);
        ctx.lineTo(r * (1.4 + i * 0.1), r * 0.22);
        ctx.lineTo(r * (1.45 + i * 0.1), r * 0.08);
        ctx.fill();
      }
      eye(ctx, r * 1.25, -r * 0.15, Math.max(2, r * 0.12));
      break;
    }
    case 'shark': {
      ctx.save();
      ctx.translate(-r * 1.3, 0);
      ctx.rotate(wag * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-r * 0.7, -r * 0.85);
      ctx.lineTo(-r * 0.45, 0);
      ctx.lineTo(-r * 0.6, r * 0.5);
      ctx.closePath();
      fillStroke(ctx, def.finColor);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.38);
      ctx.lineTo(-r * 0.15, -r * 1.05);
      ctx.lineTo(r * 0.35, -r * 0.38);
      ctx.closePath();
      fillStroke(ctx, def.finColor);
      ellipse(ctx, 0, 0, r * 1.5, r * 0.45);
      fillStroke(ctx, body);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ellipse(ctx, r * 0.1, r * 0.22, r * 1.25, r * 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.1, r * 0.3);
      ctx.lineTo(-r * 0.25, r * 0.85);
      ctx.lineTo(r * 0.45, r * 0.3);
      ctx.closePath();
      fillStroke(ctx, def.finColor);
      ctx.strokeStyle = 'rgba(16,32,44,0.6)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(r * (0.75 - i * 0.12), -r * 0.15);
        ctx.lineTo(r * (0.7 - i * 0.12), r * 0.15);
        ctx.stroke();
      }
      eye(ctx, r * 1.1, -r * 0.1, Math.max(2, r * 0.08));
      break;
    }
    case 'round': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 0.6);
      ctx.lineTo(-r * 0.45 + wag * r * 0.3, -r * 1.55);
      ctx.lineTo(-r * 0.65, -r * 0.5);
      ctx.closePath();
      fillStroke(ctx, def.finColor);
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, r * 0.6);
      ctx.lineTo(-r * 0.45 - wag * r * 0.3, r * 1.55);
      ctx.lineTo(-r * 0.65, r * 0.5);
      ctx.closePath();
      fillStroke(ctx, def.finColor);
      ellipse(ctx, -r * 0.82, 0, r * 0.18, r * 0.55);
      fillStroke(ctx, def.finColor);
      ellipse(ctx, 0, 0, r * 0.88, r * 0.8);
      fillStroke(ctx, body, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ellipse(ctx, 0, r * 0.35, r * 0.7, r * 0.35);
      ctx.fill();
      eye(ctx, r * 0.55, -r * 0.15, r * 0.1);
      break;
    }
    case 'squid': {
      ctx.strokeStyle = body;
      ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const oy = (i - 2) * r * 0.12;
        ctx.beginPath();
        ctx.moveTo(r * 0.6, oy);
        ctx.quadraticCurveTo(r * 1.2, oy + Math.sin(anim * 5 + i) * r * 0.25, r * 1.8, oy * 1.8 + Math.sin(anim * 5 + i + 1) * r * 0.3);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, 0);
      ctx.lineTo(-r * 1.5, -r * 0.45);
      ctx.lineTo(-r * 1.5, r * 0.45);
      ctx.closePath();
      fillStroke(ctx, def.finColor, 1);
      ellipse(ctx, -r * 0.25, 0, r * 1.1, r * 0.42);
      fillStroke(ctx, body);
      if (def.glow) {
        ctx.fillStyle = '#e8ffff';
        for (let i = 0; i < 5; i++) {
          ellipse(ctx, -r * (0.9 - i * 0.35), Math.sin(i * 2.1) * r * 0.2, r * 0.07 + 0.6, r * 0.07 + 0.6);
          ctx.fill();
        }
      }
      eye(ctx, r * 0.55, -r * 0.08, Math.max(1.8, r * 0.14));
      break;
    }
    case 'angler': {
      ctx.save();
      ctx.translate(-r * 0.8, 0);
      ctx.rotate(wag);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-r * 0.6, -r * 0.5);
      ctx.lineTo(-r * 0.6, r * 0.5);
      ctx.closePath();
      fillStroke(ctx, def.finColor);
      ctx.restore();
      ellipse(ctx, 0, 0, r, r * 0.8);
      fillStroke(ctx, body);
      ctx.beginPath();
      ctx.moveTo(r * 0.95, -r * 0.05);
      ctx.lineTo(r * 0.3, r * 0.15);
      ctx.lineTo(r * 0.9, r * 0.5);
      ctx.closePath();
      ctx.fillStyle = '#1a0f16';
      ctx.fill();
      ctx.fillStyle = '#f4f4f4';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(r * (0.45 + i * 0.13), r * (0.12 + i * 0.03));
        ctx.lineTo(r * (0.5 + i * 0.13), r * (0.3 + i * 0.03));
        ctx.lineTo(r * (0.55 + i * 0.13), r * (0.12 + i * 0.03));
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(r * 0.2, -r * 0.75);
      ctx.quadraticCurveTo(r * 0.9, -r * 1.6, r * 1.1, -r * 1.15);
      ctx.strokeStyle = def.finColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ellipse(ctx, r * 1.1, -r * 1.15, r * 0.16, r * 0.16);
      ctx.fillStyle = '#c8fbff';
      ctx.fill();
      eye(ctx, r * 0.45, -r * 0.35, r * 0.1);
      break;
    }
  }
}

/** 초롱아귀 미끼 등 발광 위치 (조명 패스에서 사용) */
export function glowPoint(f: Fish): { x: number; y: number } {
  if (f.def.shape === 'angler') return { x: f.pos.x + f.facing * f.radius * 1.1, y: f.pos.y - f.radius * 1.15 };
  return { x: f.pos.x, y: f.pos.y };
}

// ───────────────────────── 잠수부 ─────────────────────────

export function drawDiver(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, d: Diver, weapon: WeaponDef, time: number): void {
  if (d.hurtTimer > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.45;
  ctx.save();
  ctx.translate(d.pos.x, d.pos.y);
  ctx.rotate(d.bodyAngle);
  if (Math.cos(d.bodyAngle) < 0) ctx.scale(1, -1);

  if (!atlas.drawCentered(ctx, 'diver', 92)) {
    const kick = Math.sin(d.kick * 3) * 0.45;
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    for (const s of [1, -1]) {
      ctx.save();
      ctx.translate(-14, s * 2);
      ctx.rotate(kick * s);
      ctx.beginPath();
      ctx.moveTo(0, -2.5);
      ctx.lineTo(-17, -6);
      ctx.lineTo(-17, 4);
      ctx.lineTo(0, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.roundRect(-11, -14, 16, 6, 3);
    fillStroke(ctx, '#cfd6dc');
    ctx.beginPath();
    ctx.roundRect(-16, -7, 30, 14, 7);
    fillStroke(ctx, '#1b2330');
    ctx.fillStyle = '#ff8a3d';
    ctx.fillRect(-6, -7, 3, 14);
    ellipse(ctx, 17, -1, 7, 7);
    fillStroke(ctx, '#1b2330');
    ctx.beginPath();
    ctx.roundRect(18, -5, 6, 6, 2);
    fillStroke(ctx, '#9fe3ff', 1.2);
  }
  ctx.restore();

  // 무기 (조준 방향)
  ctx.save();
  ctx.translate(d.pos.x, d.pos.y);
  ctx.rotate(d.aimAngle);
  if (Math.cos(d.aimAngle) < 0) ctx.scale(1, -1);
  ctx.strokeStyle = OUTLINE;
  ctx.lineCap = 'round';
  if (weapon.type === 'melee') {
    const ext = d.thrustTimer > 0 ? 18 : 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8a6a48';
    ctx.beginPath();
    ctx.moveTo(-6 + ext, 4);
    ctx.lineTo(30 + ext, 4);
    ctx.stroke();
    ctx.fillStyle = '#e8eef2';
    ctx.beginPath();
    ctx.moveTo(30 + ext, 0);
    ctx.lineTo(40 + ext, 4);
    ctx.lineTo(30 + ext, 8);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.lineWidth = 5;
    ctx.strokeStyle = weapon.type === 'net' ? '#3b6e8f' : weapon.id === 'shockspear' ? '#2a6f7c' : '#6b4f35';
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.lineTo(22, 4);
    ctx.stroke();
    if (d.reloadTimer <= 0 && weapon.type !== 'net') {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = weapon.id === 'shockspear' ? '#7ff6ff' : '#e8eef2';
      ctx.beginPath();
      ctx.moveTo(10, 1.5);
      ctx.lineTo(28, 1.5);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ───────────────────────── 무기 연출 ─────────────────────────

export function drawProjectile(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, p: Projectile, from: { x: number; y: number }): void {
  if (p.weapon.type === 'net') {
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y);
    ctx.rotate(p.traveled * 0.02);
    if (!atlas.drawCentered(ctx, 'proj_net', 22)) {
      ctx.strokeStyle = 'rgba(240,240,240,0.9)';
      ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-9, i * 5);
        ctx.lineTo(9, i * 5);
        ctx.moveTo(i * 5, -9);
        ctx.lineTo(i * 5, 9);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }
  // 작살 줄
  ctx.strokeStyle = 'rgba(235,235,225,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(p.pos.x, p.pos.y);
  ctx.stroke();

  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);
  ctx.rotate(p.angle);
  if (!atlas.drawCentered(ctx, 'proj_spear', 26)) {
    ctx.strokeStyle = p.weapon.id === 'shockspear' ? '#9ffbff' : '#e8eef2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(4, 0);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(4, -3.5);
    ctx.lineTo(10, 0);
    ctx.lineTo(4, 3.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawEffect(ctx: CanvasRenderingContext2D, e: Effect): void {
  const k = e.t / e.maxT;
  ctx.save();
  ctx.globalAlpha = 1 - k;
  switch (e.kind) {
    case 'net': {
      const r = e.radius * (0.5 + 0.5 * Math.min(1, k * 3));
      ctx.strokeStyle = '#f2f2f2';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
        ctx.lineTo(e.x - Math.cos(a) * r, e.y - Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.fillStyle = '#ff8a3d';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'zap': {
      ctx.strokeStyle = '#a6fbff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      e.points.forEach((p, i) => {
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
          return;
        }
        const prev = e.points[i - 1];
        for (let s = 1; s <= 4; s++) {
          const t = s / 4;
          const jitter = s < 4 ? (Math.random() - 0.5) * 16 : 0;
          ctx.lineTo(prev.x + (p.x - prev.x) * t + jitter, prev.y + (p.y - prev.y) * t + jitter);
        }
      });
      ctx.stroke();
      break;
    }
    case 'slash': {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * (0.8 + k * 0.2), e.angle - 0.5, e.angle + 0.5);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ───────────────────────── 채집물/상자/배 ─────────────────────────

/** 기준점(0,0)이 바닥(바위에 붙는 면)이고 -y 방향으로 자란다 */
export function drawItem(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, def: ItemDef, time: number): void {
  const img = atlas.get(`item_${def.id}`);
  if (img) {
    const w = 24;
    const h = (w * img.naturalHeight) / img.naturalWidth;
    ctx.drawImage(img, -w / 2, -h, w, h);
    return;
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  switch (def.shape) {
    case 'seaweed':
      ctx.lineCap = 'round';
      for (const i of [-4, 0, 4]) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.quadraticCurveTo(i + Math.sin(time * 2 + i) * 5, -10, i + Math.sin(time * 2 + i + 1) * 6, -20 - Math.abs(i));
        ctx.lineWidth = 3;
        ctx.strokeStyle = def.color;
        ctx.stroke();
      }
      break;
    case 'shell':
      ctx.beginPath();
      ctx.moveTo(-4, -11);
      ctx.lineTo(0, -19);
      ctx.lineTo(4, -11);
      ctx.closePath();
      fillStroke(ctx, '#e3c79f', 1.2);
      ellipse(ctx, 0, -6, 8, 6.5);
      fillStroke(ctx, def.color, 1.2);
      ctx.beginPath();
      ctx.arc(0, -6, 3.5, 0, Math.PI * 1.5);
      ctx.stroke();
      break;
    case 'urchin':
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 16; k++) {
        const a = Math.PI + (k / 15) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(Math.cos(a) * 12, -5 + Math.sin(a) * 12);
        ctx.stroke();
      }
      ellipse(ctx, 0, -5, 6, 5.5);
      fillStroke(ctx, '#57406e', 1.2);
      break;
    case 'abalone': {
      ellipse(ctx, 0, -4, 11, 5);
      fillStroke(ctx, def.color, 1.2);
      const g = ctx.createLinearGradient(-7, -6, 7, -2);
      g.addColorStop(0, '#d7f5ee');
      g.addColorStop(0.5, '#c3b6f0');
      g.addColorStop(1, '#8fd1c9');
      ctx.fillStyle = g;
      ellipse(ctx, 0, -4.5, 7, 3);
      ctx.fill();
      ctx.fillStyle = OUTLINE;
      for (let i = 0; i < 4; i++) {
        ellipse(ctx, -6 + i * 4, -7.5, 1, 1);
        ctx.fill();
      }
      break;
    }
    case 'cucumber':
      ctx.beginPath();
      ctx.roundRect(-11, -8, 22, 8, 4);
      fillStroke(ctx, def.color, 1.2);
      ctx.fillStyle = '#8a6448';
      for (let i = 0; i < 5; i++) {
        ellipse(ctx, -8 + i * 4, -7.5, 1.4, 1.4);
        ctx.fill();
      }
      break;
    case 'pearl':
      ellipse(ctx, 0, -3, 10, 4);
      fillStroke(ctx, '#8d8f98', 1.2);
      ctx.save();
      ctx.translate(-2, -8);
      ctx.rotate(-0.4);
      ellipse(ctx, 0, 0, 9, 3.5);
      fillStroke(ctx, '#a9abb4', 1.2);
      ctx.restore();
      ellipse(ctx, 1, -5, 3.4, 3.4);
      fillStroke(ctx, def.color, 1);
      ctx.fillStyle = '#fff';
      ellipse(ctx, 0, -6, 1, 1);
      ctx.fill();
      break;
    case 'ore': {
      const pts = [8, 6.5, 9, 7, 8.5, 6, 7.5, 8];
      ctx.beginPath();
      pts.forEach((r, i) => {
        const a = (i / pts.length) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = -7 + Math.sin(a) * r * 0.85;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      fillStroke(ctx, def.color, 1.2);
      ctx.fillStyle = '#9aa7b8';
      for (const [x, y] of [[-3, -9], [2, -5], [4, -10], [-1, -3]]) {
        ellipse(ctx, x, y, 1.1, 1.1);
        ctx.fill();
      }
      break;
    }
  }
}

export function drawCrate(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, c: Crate, time: number): void {
  ctx.save();
  ctx.translate(c.pos.x, c.pos.y + Math.sin(time * 1.5 + c.pos.x) * 1.5);
  if (!atlas.drawCentered(ctx, 'crate', 30)) {
    ctx.beginPath();
    ctx.roundRect(-13, -11, 26, 22, 3);
    fillStroke(ctx, '#9a6b3f', 1.8);
    ctx.strokeStyle = '#6d4a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(13, 0);
    ctx.moveTo(-6, -11);
    ctx.lineTo(-6, 11);
    ctx.moveTo(6, -11);
    ctx.lineTo(6, 11);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-4, -5, 8, 6);
  }
  ctx.restore();
}

/** 산소 스테이션: 쌍둥이 산소통 + 상태등. charge = 0(방금 사용)~1(사용 가능) */
export function drawOxygenStation(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, s: OxygenStation, charge: number, time: number): void {
  const ready = charge >= 1;
  ctx.save();
  ctx.translate(s.pos.x, s.pos.y + Math.sin(time * 1.2 + s.pos.y) * 1.2);
  if (!ready) ctx.globalAlpha = 0.6;
  if (!atlas.drawCentered(ctx, 'oxygen_station', 40)) {
    // 받침대
    ctx.beginPath();
    ctx.roundRect(-17, 12, 34, 7, 2);
    fillStroke(ctx, '#56646e');
    // 산소통 두 개
    for (const x of [-8, 8]) {
      ctx.beginPath();
      ctx.roundRect(x - 6, -14, 12, 27, 5);
      fillStroke(ctx, ready ? '#f2f5f5' : '#a9b2b6');
      ctx.fillStyle = ready ? '#2fbf8f' : '#6c7a7f';
      ctx.fillRect(x - 6, -6, 12, 4);
      ctx.beginPath();
      ctx.roundRect(x - 2.5, -19, 5, 6, 1.5);
      fillStroke(ctx, '#3a4a52', 1.2);
    }
    // 밸브 연결관
    ctx.strokeStyle = '#3a4a52';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -18);
    ctx.quadraticCurveTo(0, -25, 8, -18);
    ctx.stroke();
    // 상태등
    ellipse(ctx, 0, -24, 3, 3);
    ctx.fillStyle = ready ? `rgba(120,255,200,${0.7 + Math.sin(time * 4) * 0.3})` : '#ff8a5a';
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (!ready) {
    ctx.strokeStyle = 'rgba(95,224,200,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 워프 포인트: 회전하는 물살 고리 */
export function drawWarp(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, w: WarpPoint, time: number): void {
  ctx.save();
  ctx.translate(w.pos.x, w.pos.y + Math.sin(time * 1.4 + w.pos.x) * 2);
  if (!atlas.drawCentered(ctx, 'warp', 64)) {
    const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
    core.addColorStop(0, 'rgba(230,255,255,0.95)');
    core.addColorStop(0.45, 'rgba(110,220,255,0.55)');
    core.addColorStop(1, 'rgba(90,120,255,0)');
    ctx.fillStyle = core;
    ellipse(ctx, 0, 0, 28, 28);
    ctx.fill();
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const r = 14 + i * 7;
      const a = time * (2.4 - i * 0.6) * (i % 2 ? -1 : 1) + i * 2;
      ctx.strokeStyle = i === 1 ? 'rgba(190,150,255,0.85)' : 'rgba(140,240,255,0.9)';
      ctx.lineWidth = 3 - i * 0.6;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, r, a + k * Math.PI, a + k * Math.PI + Math.PI * 0.6);
        ctx.stroke();
      }
    }
    // 빨려 들어가는 거품
    ctx.fillStyle = 'rgba(220,250,255,0.8)';
    for (let k = 0; k < 6; k++) {
      const p = (time * 0.6 + k / 6) % 1;
      const a = k * 1.7 + p * 3;
      const r = 34 * (1 - p);
      ellipse(ctx, Math.cos(a) * r, Math.sin(a) * r, 1.6, 1.6);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawBoat(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, x: number, y: number, time: number, scale = 1): void {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 1.6) * 2 * scale);
  ctx.rotate(Math.sin(time * 1.2) * 0.03);
  ctx.scale(scale, scale);
  if (atlas.get('boat')) {
    ctx.translate(0, -22);
    atlas.drawCentered(ctx, 'boat', 130);
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(-26, -14);
  ctx.lineTo(-26, -52);
  ctx.strokeStyle = '#5b4636';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-26, -52);
  ctx.lineTo(-10 + Math.sin(time * 4) * 2, -47);
  ctx.lineTo(-26, -42);
  ctx.closePath();
  ctx.fillStyle = '#ff8a3d';
  ctx.fill();
  ctx.beginPath();
  ctx.rect(-10, -30, 26, 16);
  fillStroke(ctx, '#e6e1d4');
  ctx.fillStyle = '#7fb8d8';
  ctx.fillRect(-6, -26, 8, 6);
  ctx.fillRect(5, -26, 7, 6);
  ctx.beginPath();
  ctx.moveTo(-48, -14);
  ctx.lineTo(50, -14);
  ctx.lineTo(38, 6);
  ctx.lineTo(-40, 6);
  ctx.closePath();
  fillStroke(ctx, '#f4f1e8', 2);
  ctx.fillStyle = '#2f6fa3';
  ctx.fillRect(-45, -9, 92, 4);
  ctx.fillStyle = '#b8433a';
  ctx.beginPath();
  ctx.moveTo(-42, 2);
  ctx.lineTo(41, 2);
  ctx.lineTo(38, 6);
  ctx.lineTo(-40, 6);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, 32, -18, 4.5, 4.5);
  fillStroke(ctx, '#ff8a3d', 1.2);
  ctx.restore();
}

export function drawParticles(ctx: CanvasRenderingContext2D, list: readonly Particle[]): void {
  for (const p of list) {
    const a = 1 - p.life / p.maxLife;
    ctx.globalAlpha = Math.max(0, a);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.kind === 'puff' ? p.size * (1 + (1 - a)) : p.size, 0, Math.PI * 2);
    if (p.kind === 'bubble') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** 무기 아이콘 (HUD/배 화면 공용) */
export function drawWeaponIcon(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, w: WeaponDef, size: number): void {
  if (atlas.drawCentered(ctx, `weapon_${w.id}`, size)) return;
  const s = size / 40;
  ctx.save();
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#e8eef2';
  ctx.lineWidth = 2;
  switch (w.type) {
    case 'melee':
      ctx.rotate(-0.6);
      ctx.strokeStyle = '#c9a77c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      ctx.fillStyle = '#e8eef2';
      ctx.beginPath();
      ctx.moveTo(10, -5);
      ctx.lineTo(18, 0);
      ctx.lineTo(10, 5);
      ctx.fill();
      break;
    case 'net':
      ctx.fillStyle = '#3b6e8f';
      ctx.fillRect(-14, -4, 18, 8);
      ctx.beginPath();
      ctx.arc(10, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(16, 0);
      ctx.moveTo(10, -6);
      ctx.lineTo(10, 6);
      ctx.stroke();
      break;
    default: {
      const n = w.projectiles ?? 1;
      ctx.fillStyle = w.id === 'shockspear' ? '#2a6f7c' : '#6b4f35';
      ctx.fillRect(-16, -3, 18, 6 + (n - 1) * 3);
      ctx.strokeStyle = w.id === 'shockspear' ? '#7ff6ff' : '#e8eef2';
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(-6, -5 + i * 4);
        ctx.lineTo(17, -5 + i * 4);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
