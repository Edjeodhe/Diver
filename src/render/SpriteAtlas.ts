import type { SpriteManifest } from '../data/types';

/**
 * 스프라이트 이미지 로더. 이미지가 아직 없거나 로드에 실패하면 null을 돌려주고,
 * 렌더러는 절차적 벡터 드로잉으로 대체한다. Unity: Sprite Atlas + Addressables.
 */
export class SpriteAtlas {
  private readonly images = new Map<string, HTMLImageElement>();

  constructor(manifest: SpriteManifest) {
    const base = import.meta.env.BASE_URL + manifest.basePath;
    for (const s of manifest.sprites) {
      const img = new Image();
      img.decoding = 'async';
      img.src = base + s.file;
      this.images.set(s.id, img);
    }
  }

  get(id: string): HTMLImageElement | null {
    const img = this.images.get(id);
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  /** 중심 기준으로 지정 폭에 맞춰 그린다 (높이는 원본 비율 유지). */
  drawCentered(ctx: CanvasRenderingContext2D, id: string, width: number): boolean {
    const img = this.get(id);
    if (!img) return false;
    const h = (width * img.naturalHeight) / img.naturalWidth;
    ctx.drawImage(img, -width / 2, -h / 2, width, h);
    return true;
  }
}
