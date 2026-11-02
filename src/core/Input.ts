import { VIEW_H, VIEW_W } from './config';

const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

/** 키보드/마우스 입력 상태. Unity 이식 시 Input System의 Action Map으로 대체. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  mouseX = VIEW_W / 2;
  mouseY = VIEW_H / 2;
  mouseDown = false;
  mousePressed = false;
  wheel = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => this.updateMouse(canvas, e));
    canvas.addEventListener('mousedown', (e) => {
      this.updateMouse(canvas, e);
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updateMouse(canvas: HTMLCanvasElement, e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    this.mouseX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    this.mouseY = ((e.clientY - rect.top) / rect.height) * VIEW_H;
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  axisX(): number {
    return (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  }

  /** 아래(+y)가 양수 */
  axisY(): number {
    return (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
  }

  endFrame(): void {
    this.pressed.clear();
    this.mousePressed = false;
    this.wheel = 0;
  }
}
