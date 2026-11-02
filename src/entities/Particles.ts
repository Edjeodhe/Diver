export type ParticleKind = 'bubble' | 'spark' | 'puff';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
}

const MAX_PARTICLES = 500;

/** 연출용 파티클. 게임 로직에 영향이 없으므로 Math.random 사용. Unity: ParticleSystem */
export class Particles {
  list: Particle[] = [];

  bubble(x: number, y: number, size: number): void {
    this.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 12,
      vy: -30 - Math.random() * 25,
      life: 0,
      maxLife: 1.4 + Math.random(),
      size,
      color: 'rgba(225,248,255,0.75)',
      kind: 'bubble',
    });
  }

  burst(x: number, y: number, color: string, count: number, speed: number, kind: ParticleKind = 'spark'): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        maxLife: kind === 'puff' ? 0.7 + Math.random() * 0.5 : 0.35 + Math.random() * 0.35,
        size: kind === 'puff' ? 4 + Math.random() * 5 : 1.5 + Math.random() * 2.5,
        color,
        kind,
      });
    }
  }

  private push(p: Particle): void {
    if (this.list.length < MAX_PARTICLES) this.list.push(p);
  }

  update(dt: number): void {
    const drag = Math.min(1, 4 * dt);
    for (const p of this.list) {
      p.life += dt;
      if (p.kind === 'bubble') {
        p.vy -= 25 * dt;
        p.vx += Math.sin(p.life * 8) * 25 * dt;
        if (p.y < 0) p.life = p.maxLife;
      } else {
        p.vx -= p.vx * drag;
        p.vy -= p.vy * drag;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.life < p.maxLife);
  }
}
