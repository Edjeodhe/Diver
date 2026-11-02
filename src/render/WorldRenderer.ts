import { VIEW_H, VIEW_W } from '../core/config';
import { lerpColor, mod } from '../core/math';
import type { ZoneDef } from '../data/types';
import type { Terrain } from '../world/Terrain';
import type { Camera } from './Camera';

export interface Light {
  x: number;
  y: number;
  radius: number;
  intensity: number;
}

interface Stop {
  depth: number;
  color: string;
}

interface Snow {
  x: number;
  y: number;
  size: number;
  speed: number;
}

function colorAt(stops: Stop[], depthM: number): string {
  if (depthM <= stops[0].depth) return lerpColor(stops[0].color, stops[0].color, 0);
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (depthM <= b.depth) return lerpColor(a.color, b.color, (depthM - a.depth) / (b.depth - a.depth));
  }
  const last = stops[stops.length - 1];
  return lerpColor(last.color, last.color, 0);
}

/** 배경(물/하늘/빛줄기), 지형, 마린 스노우, 심도별 어둠/조명 패스. Unity: 배경 레이어 + URP 2D Light */
export class WorldRenderer {
  private readonly waterStops: Stop[];
  private readonly rockStops: Stop[];
  private readonly lightCanvas: HTMLCanvasElement;
  private readonly lightCtx: CanvasRenderingContext2D;
  private readonly snow: Snow[] = [];

  constructor(zones: ZoneDef[]) {
    this.waterStops = zones.map((z) => ({ depth: z.depthMin, color: z.water }));
    this.rockStops = zones.map((z) => ({ depth: z.depthMin, color: z.rock }));
    const last = zones[zones.length - 1];
    this.waterStops.push({ depth: last.depthMax, color: '#01060c' });
    this.rockStops.push({ depth: last.depthMax, color: '#060f17' });

    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = VIEW_W;
    this.lightCanvas.height = VIEW_H;
    const lctx = this.lightCanvas.getContext('2d');
    if (!lctx) throw new Error('Canvas 2D unavailable');
    this.lightCtx = lctx;
    for (let i = 0; i < 80; i++) {
      this.snow.push({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, size: 0.6 + Math.random() * 1.6, speed: 4 + Math.random() * 10 });
    }
  }

  drawBackground(ctx: CanvasRenderingContext2D, cam: Camera, ppm: number): void {
    const surfaceY = -cam.top;
    if (surfaceY > 0) {
      const sky = ctx.createLinearGradient(0, 0, 0, surfaceY);
      sky.addColorStop(0, '#8fd0f0');
      sky.addColorStop(1, '#e4f6fb');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, VIEW_W, surfaceY);
    }
    const top = Math.max(0, surfaceY);
    if (top >= VIEW_H) return;
    const topM = Math.max(0, (cam.top + top) / ppm);
    const botM = Math.max(0, cam.bottom / ppm);
    const g = ctx.createLinearGradient(0, top, 0, VIEW_H);
    g.addColorStop(0, colorAt(this.waterStops, topM));
    g.addColorStop(0.5, colorAt(this.waterStops, (topM + botM) / 2));
    g.addColorStop(1, colorAt(this.waterStops, botM));
    ctx.fillStyle = g;
    ctx.fillRect(0, top, VIEW_W, VIEW_H - top);
  }

  /** 월드 좌표계에서 호출 */
  drawLightRays(ctx: CanvasRenderingContext2D, cam: Camera, time: number): void {
    if (cam.top > 700) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, 0, 0, 560);
    g.addColorStop(0, 'rgba(210,245,255,0.11)');
    g.addColorStop(1, 'rgba(210,245,255,0)');
    ctx.fillStyle = g;
    const start = Math.floor(cam.left / 170) * 170 - 340;
    for (let x = start; x < cam.right + 340; x += 170) {
      const sway = Math.sin(time * 0.4 + x * 0.013) * 30;
      const w = 30 + mod(x * 7, 40);
      ctx.beginPath();
      ctx.moveTo(x + sway, 0);
      ctx.lineTo(x + sway + w, 0);
      ctx.lineTo(x + sway * 2 + w + 140, 560);
      ctx.lineTo(x + sway * 2 + 100, 560);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** 수면 위 해안(섬) + 수중 벽 + 해저면 */
  drawTerrain(ctx: CanvasRenderingContext2D, terrain: Terrain, cam: Camera, ppm: number): void {
    const edge = 5000;
    if (cam.top < 20) {
      for (const side of [-1, 1]) {
        const wx = side < 0 ? terrain.leftWall(0) : terrain.rightWall(0);
        ctx.beginPath();
        ctx.moveTo(side * edge, -70);
        ctx.lineTo(wx - side * 90, -70);
        ctx.quadraticCurveTo(wx - side * 20, -55, wx, 8);
        ctx.lineTo(side * edge, 8);
        ctx.closePath();
        ctx.fillStyle = '#4a6b45';
        ctx.fill();
        ctx.fillStyle = '#6f9a52';
        ctx.fillRect(Math.min(side * edge, wx - side * 90), -74, Math.abs(side * edge - (wx - side * 90)), 6);
      }
    }

    const top = Math.max(0, cam.top - 40);
    const bottom = cam.bottom + 40;
    if (bottom <= 0) return;
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, colorAt(this.rockStops, top / ppm));
    grad.addColorStop(1, colorAt(this.rockStops, bottom / ppm));
    const step = 14;

    for (const side of [-1, 1]) {
      const wall = (y: number) => (side < 0 ? terrain.leftWall(y) : terrain.rightWall(y));
      ctx.beginPath();
      ctx.moveTo(side * edge, top);
      for (let y = top; y <= bottom; y += step) ctx.lineTo(wall(y), y);
      ctx.lineTo(wall(bottom), bottom);
      ctx.lineTo(side * edge, bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      for (let y = top; y <= bottom; y += step) {
        const x = wall(y) - side * 3;
        if (y === top) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(170,225,235,0.16)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (bottom > terrain.depthPx - 200) {
      const floorBottom = Math.max(bottom, terrain.depthPx + 200);
      ctx.beginPath();
      ctx.moveTo(cam.left - 20, floorBottom);
      for (let x = cam.left - 20; x <= cam.right + 20; x += step) ctx.lineTo(x, terrain.floorY(x));
      ctx.lineTo(cam.right + 20, floorBottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      for (let x = cam.left - 20; x <= cam.right + 20; x += step) {
        const y = terrain.floorY(x) + 3;
        if (x === cam.left - 20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(170,225,235,0.14)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  drawSurface(ctx: CanvasRenderingContext2D, cam: Camera, time: number): void {
    if (cam.top > 30 || cam.bottom < -30) return;
    ctx.beginPath();
    for (let x = cam.left - 12; x <= cam.right + 12; x += 12) {
      const y = Math.sin(x * 0.03 + time * 2) * 1.6;
      if (x === cam.left - 12) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(235,252,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** 화면 좌표계에서 호출. 수중 부유물(마린 스노우) */
  drawSnow(ctx: CanvasRenderingContext2D, cam: Camera, time: number, depthM: number): void {
    const alpha = Math.min(0.5, 0.15 + depthM / 300);
    ctx.fillStyle = `rgba(220,240,255,${alpha})`;
    for (const s of this.snow) {
      const sx = mod(s.x - cam.x * 0.7, VIEW_W);
      const sy = mod(s.y - cam.y * 0.7 + time * s.speed, VIEW_H);
      if (sy + cam.top < 0) continue;
      ctx.fillRect(sx, sy, s.size, s.size);
    }
  }

  /** 어둠 오버레이에 조명 구멍을 뚫는다 (destination-out) */
  drawLighting(ctx: CanvasRenderingContext2D, cam: Camera, darkness: number, lights: readonly Light[]): void {
    if (darkness <= 0.01) return;
    const l = this.lightCtx;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, VIEW_W, VIEW_H);
    l.fillStyle = `rgba(1,5,14,${darkness})`;
    l.fillRect(0, 0, VIEW_W, VIEW_H);
    l.globalCompositeOperation = 'destination-out';
    for (const light of lights) {
      const p = cam.worldToScreen(light.x, light.y);
      if (p.x < -light.radius || p.x > VIEW_W + light.radius || p.y < -light.radius || p.y > VIEW_H + light.radius) continue;
      const g = l.createRadialGradient(p.x, p.y, 0, p.x, p.y, light.radius);
      g.addColorStop(0, `rgba(0,0,0,${light.intensity})`);
      g.addColorStop(0.55, `rgba(0,0,0,${light.intensity * 0.65})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g;
      l.fillRect(p.x - light.radius, p.y - light.radius, light.radius * 2, light.radius * 2);
    }
    // 조명 버퍼는 부드럽게 확대해야 경계가 계단지지 않는다
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lightCanvas, 0, 0, VIEW_W, VIEW_H);
    ctx.imageSmoothingEnabled = false;
  }
}
