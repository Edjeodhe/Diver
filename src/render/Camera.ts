import { VIEW_H, VIEW_W } from '../core/config';
import { clamp, damp, lerp, type Vec2 } from '../core/math';

/** 2D 추적 카메라. Unity: Cinemachine 2D Virtual Camera + Impulse(흔들림) */
export class Camera {
  x = 0;
  y = 0;
  shake = 0;
  private shakeX = 0;
  private shakeY = 0;

  get left(): number {
    return this.x - VIEW_W / 2;
  }
  get right(): number {
    return this.x + VIEW_W / 2;
  }
  get top(): number {
    return this.y - VIEW_H / 2;
  }
  get bottom(): number {
    return this.y + VIEW_H / 2;
  }

  snap(target: Vec2): void {
    this.x = target.x;
    this.y = target.y + 40;
  }

  follow(target: Vec2, dt: number, worldBottom: number): void {
    const k = damp(5, dt);
    this.x = lerp(this.x, target.x, k);
    this.y = lerp(this.y, target.y + 40, k);
    this.y = clamp(this.y, -VIEW_H * 0.3, worldBottom + 60 - VIEW_H / 2);
    this.shake = Math.max(0, this.shake - dt * 25);
    this.shakeX = (Math.random() * 2 - 1) * this.shake;
    this.shakeY = (Math.random() * 2 - 1) * this.shake;
  }

  apply(ctx: CanvasRenderingContext2D): void {
    ctx.translate(Math.round(VIEW_W / 2 - this.x + this.shakeX), Math.round(VIEW_H / 2 - this.y + this.shakeY));
  }

  worldToScreen(x: number, y: number): Vec2 {
    return { x: x - this.x + VIEW_W / 2, y: y - this.y + VIEW_H / 2 };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return { x: sx + this.x - VIEW_W / 2, y: sy + this.y - VIEW_H / 2 };
  }

  isVisible(x: number, y: number, margin: number): boolean {
    return x > this.left - margin && x < this.right + margin && y > this.top - margin && y < this.bottom + margin;
  }
}
