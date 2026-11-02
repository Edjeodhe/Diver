import { clamp, lerp, type Vec2 } from '../core/math';
import { Noise1D, type Rng } from '../core/Random';
import type { BalanceDef } from '../data/types';

/**
 * 다이브마다 시드로 새로 생성되는 수직 해구(shaft) 지형.
 * 좌우 벽은 깊이(y)에 대한 함수, 해저면은 x에 대한 함수로 표현한다.
 * Unity: 같은 함수로 EdgeCollider2D 포인트와 SpriteShape/Mesh를 생성.
 */
export class Terrain {
  readonly depthPx: number;
  private readonly leftCoarse: Noise1D;
  private readonly leftFine: Noise1D;
  private readonly rightCoarse: Noise1D;
  private readonly rightFine: Noise1D;
  private readonly widthNoise: Noise1D;
  private readonly floorNoise: Noise1D;

  constructor(
    rng: Rng,
    private readonly b: BalanceDef,
  ) {
    this.depthPx = b.worldDepthM * b.pxPerMeter;
    const len = this.depthPx + 600;
    this.leftCoarse = new Noise1D(rng, 360, -300, len);
    this.leftFine = new Noise1D(rng, 80, -300, len);
    this.rightCoarse = new Noise1D(rng, 360, -300, len);
    this.rightFine = new Noise1D(rng, 80, -300, len);
    this.widthNoise = new Noise1D(rng, 700, -300, len);
    const floorLen = (b.shaftHalfWidthTop + b.wallNoiseAmp) * 2 + 800;
    this.floorNoise = new Noise1D(rng, 120, -floorLen / 2, floorLen);
  }

  private halfWidth(y: number): number {
    const t = clamp(y / this.depthPx, 0, 1);
    return lerp(this.b.shaftHalfWidthTop, this.b.shaftHalfWidthBottom, t) + this.widthNoise.sample(y) * 90;
  }

  leftWall(y: number): number {
    const yy = Math.max(0, y);
    const n = this.leftCoarse.sample(yy) * 0.75 + this.leftFine.sample(yy) * 0.25;
    return -this.halfWidth(yy) + n * this.b.wallNoiseAmp;
  }

  rightWall(y: number): number {
    const yy = Math.max(0, y);
    const n = this.rightCoarse.sample(yy) * 0.75 + this.rightFine.sample(yy) * 0.25;
    return this.halfWidth(yy) + n * this.b.wallNoiseAmp;
  }

  floorY(x: number): number {
    return this.depthPx - (this.floorNoise.sample(x) * 0.5 + 0.5) * this.b.floorNoiseAmp;
  }

  isInside(x: number, y: number): boolean {
    return x > this.leftWall(y) && x < this.rightWall(y) && y < this.floorY(x);
  }

  /** 원(pos, r)을 지형 밖으로 밀어낸다. 충돌 시 true */
  collide(pos: Vec2, r: number, vel?: Vec2): boolean {
    let hit = false;
    const left = this.leftWall(pos.y) + r;
    if (pos.x < left) {
      pos.x = left;
      if (vel && vel.x < 0) vel.x = 0;
      hit = true;
    }
    const right = this.rightWall(pos.y) - r;
    if (pos.x > right) {
      pos.x = right;
      if (vel && vel.x > 0) vel.x = 0;
      hit = true;
    }
    const floor = this.floorY(pos.x) - r;
    if (pos.y > floor) {
      pos.y = floor;
      if (vel && vel.y > 0) vel.y = 0;
      hit = true;
    }
    return hit;
  }
}
