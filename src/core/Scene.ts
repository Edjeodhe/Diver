/** Unity의 Scene + 루트 MonoBehaviour 역할. */
export interface Scene {
  enter(): void;
  exit(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

export type SceneId = 'dive' | 'boat';
