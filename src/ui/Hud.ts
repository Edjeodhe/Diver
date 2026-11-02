import { FONT, VIEW_H, VIEW_W } from '../core/config';
import { formatMoney } from '../core/math';
import type { WeaponDef } from '../data/types';
import { drawWeaponIcon } from '../render/Sprites';
import type { SpriteAtlas } from '../render/SpriteAtlas';

export interface HudWeaponSlot {
  def: WeaponDef;
  ammo: number;
  active: boolean;
}

export interface HudData {
  oxygen: number;
  maxOxygen: number;
  oxygenDrain: number;
  cargoWeight: number;
  capacity: number;
  cargoValue: number;
  depthM: number;
  depthLimitM: number;
  worldDepthM: number;
  bestDepthM: number;
  zoneName: string;
  modifierName: string;
  weapons: HudWeaponSlot[];
  reload: number;
  prompt: string | null;
  progress: number | null;
  mouseX: number;
  mouseY: number;
  showHelp: boolean;
}

interface Toast {
  text: string;
  color: string;
  age: number;
}

const TOAST_LIFE = 2.6;

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fillStyle = 'rgba(4,20,34,0.62)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,220,240,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, color: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (ratio <= 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(h, w * Math.min(1, ratio)), h, h / 2);
  ctx.fill();
}

/** 다이브 중 화면 UI. Unity: Screen Space Overlay Canvas (uGUI) 또는 UI Toolkit */
export class Hud {
  private toasts: Toast[] = [];

  constructor(private readonly atlas: SpriteAtlas) {}

  toast(text: string, color = '#ffffff'): void {
    this.toasts.unshift({ text, color, age: 0 });
    if (this.toasts.length > 5) this.toasts.length = 5;
  }

  update(dt: number): void {
    for (const t of this.toasts) t.age += dt;
    this.toasts = this.toasts.filter((t) => t.age < TOAST_LIFE);
  }

  draw(ctx: CanvasRenderingContext2D, d: HudData, time: number): void {
    ctx.save();
    ctx.textBaseline = 'middle';
    this.drawVitals(ctx, d, time);
    this.drawDepth(ctx, d, time);
    this.drawGauge(ctx, d);
    this.drawWeapons(ctx, d);
    this.drawPrompt(ctx, d);
    this.drawToasts(ctx);
    this.drawCrosshair(ctx, d);
    if (d.showHelp) {
      ctx.font = `12px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(230,245,255,0.75)';
      ctx.fillText('WASD 이동 · Shift 가속 · 클릭 공격 · 1/2·Q 무기 전환 · E 채집/상자/산소/귀환 · Esc 일시정지', 16, VIEW_H - 16);
    }
    ctx.restore();
  }

  private drawVitals(ctx: CanvasRenderingContext2D, d: HudData, time: number): void {
    panel(ctx, 12, 12, 252, 92);
    const ratio = d.oxygen / d.maxOxygen;
    const low = ratio < 0.25;
    const color = ratio > 0.5 ? '#5fe0c8' : ratio > 0.25 ? '#ffd166' : '#ff5d5d';
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8f6ff';
    ctx.fillText('산소', 24, 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = low && Math.floor(time * 4) % 2 === 0 ? '#ff8080' : '#e8f6ff';
    ctx.fillText(`${Math.ceil(d.oxygen)} / ${d.maxOxygen}`, 252, 30);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = d.oxygenDrain > 3 ? '#ff9a9a' : 'rgba(220,240,255,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(`-${d.oxygenDrain.toFixed(1)}/s`, 58, 30);
    bar(ctx, 24, 40, 228, 14, ratio, color);

    const cargoRatio = d.cargoWeight / d.capacity;
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = '#e8f6ff';
    ctx.fillText('망사리', 24, 70);
    ctx.textAlign = 'right';
    ctx.fillText(`${d.cargoWeight.toFixed(1)} / ${d.capacity} kg`, 252, 70);
    bar(ctx, 24, 79, 228, 8, cargoRatio, cargoRatio > 0.9 ? '#ffb347' : '#6fb7ff');
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = 'rgba(220,240,255,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(`감정가 ${formatMoney(d.cargoValue)}`, 24, 96);
  }

  private drawDepth(ctx: CanvasRenderingContext2D, d: HudData, time: number): void {
    const x = VIEW_W - 196;
    panel(ctx, x, 12, 150, 78);
    const over = d.depthM > d.depthLimitM;
    ctx.textAlign = 'right';
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillStyle = over && Math.floor(time * 5) % 2 === 0 ? '#ff6b6b' : '#ffffff';
    ctx.fillText(`${Math.floor(d.depthM)} m`, x + 138, 36);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = over ? '#ff9a9a' : 'rgba(220,240,255,0.75)';
    ctx.fillText(over ? '⚠ 수압 한계 초과 — 물숨 주의' : `안전 한계 ${d.depthLimitM} m`, x + 138, 58);
    ctx.fillStyle = '#9fd8ff';
    ctx.fillText(`${d.zoneName} · ${d.modifierName}`, x + 138, 76);
  }

  private drawGauge(ctx: CanvasRenderingContext2D, d: HudData): void {
    const x = VIEW_W - 24;
    const top = 104;
    const bottom = VIEW_H - 96;
    const toY = (m: number) => top + ((bottom - top) * m) / d.worldDepthM;
    ctx.strokeStyle = 'rgba(200,235,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(220,240,255,0.55)';
    for (let m = 0; m <= d.worldDepthM; m += 50) {
      ctx.fillRect(x - 5, toY(m) - 0.5, 10, 1);
      ctx.fillText(`${m}`, x - 8, toY(m));
    }
    const ly = toY(Math.min(d.depthLimitM, d.worldDepthM));
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(x - 7, ly - 1, 14, 2);
    if (d.bestDepthM > 0) {
      ctx.fillStyle = '#ffd65a';
      ctx.fillRect(x - 4, toY(Math.min(d.bestDepthM, d.worldDepthM)) - 1, 8, 2);
    }
    const dy = toY(Math.min(d.depthM, d.worldDepthM));
    ctx.fillStyle = '#ffe66d';
    ctx.beginPath();
    ctx.moveTo(x - 6, dy);
    ctx.lineTo(x - 14, dy - 5);
    ctx.lineTo(x - 14, dy + 5);
    ctx.closePath();
    ctx.fill();
  }

  private drawWeapons(ctx: CanvasRenderingContext2D, d: HudData): void {
    const size = 58;
    const y = VIEW_H - size - 34;
    d.weapons.forEach((slot, i) => {
      const x = VIEW_W - 22 - (d.weapons.length - i) * (size + 8);
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, 10);
      ctx.fillStyle = slot.active ? 'rgba(20,70,100,0.85)' : 'rgba(4,20,34,0.55)';
      ctx.fill();
      ctx.strokeStyle = slot.active ? '#ffe66d' : 'rgba(160,220,240,0.25)';
      ctx.lineWidth = slot.active ? 2 : 1;
      ctx.stroke();
      ctx.save();
      ctx.translate(x + size / 2, y + size / 2 - 4);
      drawWeaponIcon(ctx, this.atlas, slot.def, 40);
      ctx.restore();
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(230,245,255,0.7)';
      ctx.fillText(`${i + 1}`, x + 5, y + 9);
      ctx.textAlign = 'center';
      ctx.fillStyle = slot.ammo === 0 ? '#ff8080' : '#ffffff';
      ctx.fillText(slot.ammo < 0 ? '∞' : `${slot.ammo}`, x + size / 2, y + size - 8);
      if (slot.active && d.reload > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x + 2, y + 2 + (size - 4) * (1 - d.reload), size - 4, (size - 4) * d.reload);
      }
    });
    const active = d.weapons.find((w) => w.active);
    if (active) {
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e8f6ff';
      ctx.fillText(active.def.name, VIEW_W - 22, y - 10);
    }
  }

  private drawPrompt(ctx: CanvasRenderingContext2D, d: HudData): void {
    if (!d.prompt) return;
    ctx.font = `bold 14px ${FONT}`;
    const w = ctx.measureText(d.prompt).width + 32;
    const x = VIEW_W / 2 - w / 2;
    const y = VIEW_H - 112;
    panel(ctx, x, y, w, 34);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(d.prompt, VIEW_W / 2, y + 17);
    if (d.progress !== null) bar(ctx, x + 10, y + 38, w - 20, 6, d.progress, '#5fe0c8');
  }

  private drawToasts(ctx: CanvasRenderingContext2D): void {
    ctx.font = `bold 14px ${FONT}`;
    ctx.textAlign = 'center';
    this.toasts.forEach((t, i) => {
      const a = Math.min(1, (TOAST_LIFE - t.age) / 0.5, t.age / 0.15);
      ctx.globalAlpha = Math.max(0, a);
      const y = 40 + i * 24 - Math.min(t.age, 0.15) * 20;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,10,20,0.75)';
      ctx.strokeText(t.text, VIEW_W / 2, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, VIEW_W / 2, y);
    });
    ctx.globalAlpha = 1;
  }

  private drawCrosshair(ctx: CanvasRenderingContext2D, d: HudData): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(d.mouseX, d.mouseY, 8, 0, Math.PI * 2);
    ctx.stroke();
    if (d.reload > 0) {
      ctx.strokeStyle = '#ffe66d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(d.mouseX, d.mouseY, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - d.reload));
      ctx.stroke();
    }
  }
}
