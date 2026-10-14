import type { Intent, Vec2 } from '../core';

/** Converts a screen point (CSS pixels) to a world point (meters) using the current camera. */
export type ScreenToWorld = (screenX: number, screenY: number) => Vec2;

/** Desktop bindings (doc 03 §Desktop); only the hardware keys change, not the intents. */
export interface DesktopBindings {
  readonly left: readonly string[];
  readonly right: readonly string[];
  readonly jump: readonly string[];
  /** Optional keyboard equivalent of the primary mouse button at the last pointer position. */
  readonly rope: readonly string[];
  readonly restart: readonly string[];
  /** Respawn at the last checkpoint (GMR-103, owner-approved meta control). */
  readonly respawn: readonly string[];
  readonly pause: readonly string[];
  /** Show or hide the PB ghost (GMR-103). */
  readonly ghost: readonly string[];
  /** Show or hide the death bodies, and clear them (GMR-104). */
  readonly bodies: readonly string[];
  readonly clearBodies: readonly string[];
}

export const DEFAULT_DESKTOP_BINDINGS: DesktopBindings = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  rope: [],
  restart: ['KeyR'],
  respawn: ['Backspace'],
  pause: ['Escape', 'KeyP'],
  ghost: ['KeyG'],
  bodies: ['KeyB'],
  clearBodies: ['KeyC'],
};

/**
 * Keyboard + mouse → hardware-agnostic intents. Takes normalized device events, so it is fully
 * testable without a DOM; `bindDom` wires it to real events. Gameplay never sees device events.
 */
export class DesktopInputMapper {
  private readonly held = new Set<string>();
  private axis = 0;
  private pointer: { x: number; y: number } | null = null;
  private lastAim: Vec2 | null = null;
  private ropeHeld = false;
  private mouseHeld = false;

  constructor(
    private readonly emit: (intent: Intent) => void,
    private readonly screenToWorld: ScreenToWorld,
    private bindings: DesktopBindings = DEFAULT_DESKTOP_BINDINGS,
  ) {}

  /** Apply new bindings without leaving old held inputs stuck. Mouse input remains independent. */
  setBindings(bindings: DesktopBindings): void {
    const jumpWasHeld = this.anyHeld(this.bindings.jump);
    this.held.clear();
    this.bindings = bindings;
    if (jumpWasHeld) this.emit({ type: 'jumpRelease' });
    this.syncRope();
    this.updateAxis();
  }

  /** Also used by the DOM adapter to prevent browser shortcuts for remapped game keys. */
  isBound(code: string): boolean {
    return (
      code === 'Escape' ||
      this.bindings.left.includes(code) ||
      this.bindings.right.includes(code) ||
      this.bindings.jump.includes(code) ||
      this.bindings.rope.includes(code) ||
      this.bindings.restart.includes(code) ||
      this.bindings.respawn.includes(code) ||
      this.bindings.pause.includes(code) ||
      this.bindings.ghost.includes(code) ||
      this.bindings.bodies.includes(code) ||
      this.bindings.clearBodies.includes(code)
    );
  }

  keyDown(code: string, repeat = false): void {
    if (repeat) return;
    this.held.add(code);
    if (this.bindings.jump.includes(code)) this.emit({ type: 'jumpPress' });
    if (this.bindings.restart.includes(code)) this.emit({ type: 'restart' });
    if (this.bindings.respawn.includes(code)) this.emit({ type: 'respawn' });
    if (code === 'Escape' || this.bindings.pause.includes(code)) this.emit({ type: 'pause' });
    if (this.bindings.ghost.includes(code)) this.emit({ type: 'ghostToggle' });
    if (this.bindings.bodies.includes(code)) this.emit({ type: 'bodiesToggle' });
    if (this.bindings.clearBodies.includes(code)) this.emit({ type: 'bodiesClear' });
    if (this.bindings.rope.includes(code) && this.pointer) {
      this.emitAim(true);
      this.syncRope();
    }
    this.updateAxis();
  }

  keyUp(code: string): void {
    this.held.delete(code);
    if (this.bindings.jump.includes(code) && !this.anyHeld(this.bindings.jump)) {
      this.emit({ type: 'jumpRelease' });
    }
    if (this.bindings.rope.includes(code)) this.syncRope();
    this.updateAxis();
  }

  pointerMove(screenX: number, screenY: number): void {
    this.pointer = { x: screenX, y: screenY };
  }

  pointerDown(screenX: number, screenY: number, button: number): void {
    if (button !== 0) return;
    this.pointer = { x: screenX, y: screenY };
    this.emitAim(true);
    this.mouseHeld = true;
    this.syncRope();
  }

  pointerUp(button: number): void {
    if (button !== 0) return;
    this.mouseHeld = false;
    this.syncRope();
  }

  /** Window lost focus: release everything so no input stays stuck. */
  blur(): void {
    const jumpWasHeld = this.anyHeld(this.bindings.jump);
    this.held.clear();
    this.mouseHeld = false;
    if (jumpWasHeld) this.emit({ type: 'jumpRelease' });
    this.syncRope();
    this.updateAxis();
  }

  /** Call once per simulation tick: the aim point moves when the pointer or the camera moves. */
  beforeTick(): void {
    this.emitAim(false);
  }

  /** Returning from another device must restore mouse targeting even if the camera did not move. */
  resetAim(): void {
    this.lastAim = null;
  }

  private syncRope(): void {
    const held = this.mouseHeld || (this.pointer !== null && this.anyHeld(this.bindings.rope));
    if (held === this.ropeHeld) return;
    this.ropeHeld = held;
    this.emit({ type: held ? 'ropePress' : 'ropeRelease' });
  }

  private emitAim(force: boolean): void {
    if (!this.pointer) return;
    const target = this.screenToWorld(this.pointer.x, this.pointer.y);
    if (!force && this.lastAim && this.lastAim.x === target.x && this.lastAim.y === target.y)
      return;
    this.lastAim = target;
    this.emit({ type: 'ropeAim', target });
  }

  private updateAxis(): void {
    const axis =
      (this.anyHeld(this.bindings.right) ? 1 : 0) - (this.anyHeld(this.bindings.left) ? 1 : 0);
    if (axis !== this.axis) {
      this.axis = axis;
      this.emit({ type: 'move', axis });
    }
  }

  private anyHeld(codes: readonly string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }
}

/**
 * Attach the mapper to DOM events. Returns a function that removes every listener. Touch pointers
 * are left to the TouchInputMapper (GMR-27); mouse and pen drive the desktop mapper.
 */
export function bindDom(target: HTMLElement, mapper: DesktopInputMapper): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (mapper.isBound(e.code)) e.preventDefault();
    mapper.keyDown(e.code, e.repeat);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (mapper.isBound(e.code)) e.preventDefault();
    mapper.keyUp(e.code);
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const r = target.getBoundingClientRect();
    mapper.pointerMove(e.clientX - r.left, e.clientY - r.top);
  };
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const r = target.getBoundingClientRect();
    mapper.pointerDown(e.clientX - r.left, e.clientY - r.top, e.button);
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    mapper.pointerUp(e.button);
  };
  const onBlur = (): void => {
    mapper.blur();
  };
  const onContext = (e: Event): void => {
    e.preventDefault();
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('blur', onBlur);
  target.addEventListener('contextmenu', onContext);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('blur', onBlur);
    target.removeEventListener('contextmenu', onContext);
  };
}
