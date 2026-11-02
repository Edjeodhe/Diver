import { Database } from '../data/Database';
import type { DiveResult } from '../model/DiveSession';
import type { GameState } from '../model/GameState';
import { SpriteAtlas } from '../render/SpriteAtlas';
import { VIEW_H, VIEW_W } from './config';
import { Input } from './Input';
import { loadGame, saveGame } from './SaveSystem';
import type { Scene, SceneId } from './Scene';

/** 게임 루프와 씬 전환을 담당. Unity: DontDestroyOnLoad GameManager + SceneManager.LoadScene */
export class Game {
  readonly ctx: CanvasRenderingContext2D;
  readonly input: Input;
  readonly db = new Database();
  readonly sprites: SpriteAtlas;
  state: GameState;
  /** 씬 간 데이터 전달 (다이브 → 배) */
  lastDiveResult: DiveResult | null = null;

  private readonly factories = new Map<SceneId, () => Scene>();
  private scene: Scene | null = null;
  private lastTime = 0;
  private pixelScale = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly uiRoot: HTMLElement,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D를 지원하지 않는 브라우저입니다.');
    this.ctx = ctx;
    this.input = new Input(canvas);
    this.sprites = new SpriteAtlas(this.db.sprites);
    this.state = loadGame(this.db);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  registerScene(id: SceneId, factory: () => Scene): void {
    this.factories.set(id, factory);
  }

  loadScene(id: SceneId): void {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Scene "${id}" is not registered`);
    this.scene?.exit();
    this.scene = factory();
    this.scene.enter();
  }

  save(): void {
    saveGame(this.state);
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  private resize(): void {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
    this.canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
    this.canvas.width = Math.round(VIEW_W * scale * dpr);
    this.canvas.height = Math.round(VIEW_H * scale * dpr);
    this.pixelScale = scale * dpr;
  }

  private readonly frame = (time: number): void => {
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 1 / 20) : 0;
    this.lastTime = time;
    if (this.scene) {
      this.scene.update(dt);
      this.ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
      // 도트 스프라이트가 번지지 않도록 최근접 보간 (Unity: Filter Mode = Point)
      this.ctx.imageSmoothingEnabled = false;
      this.scene.render(this.ctx);
    }
    this.input.endFrame();
    requestAnimationFrame(this.frame);
  };
}
