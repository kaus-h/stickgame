import type { Intent, Vec2 } from '../core';

/** Standard-mapping button ids offered for Rope; A and Start retain Jump and Pause. */
export const GAMEPAD_ROPE_BUTTONS = [7, 5, 6, 4, 2, 1] as const;
export const DEFAULT_GAMEPAD_ROPE_BUTTON = 7;

export interface GamepadState {
  readonly index: number;
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

/** Standard gamepad → core intents. No screen cursor: right stick points from the player. */
export class GamepadInputMapper {
  private index: number | null = null;
  private axis = 0;
  private direction: Vec2 = { x: 0, y: 0 };
  private jump = false;
  private rope = false;
  private pause = false;

  constructor(
    private readonly emit: (intent: Intent) => void,
    private ropeButton: number = DEFAULT_GAMEPAD_ROPE_BUTTON,
    private readonly onActivity: () => void = () => undefined,
  ) {}

  setRopeButton(button: number): void {
    if (!GAMEPAD_ROPE_BUTTONS.some((id) => id === button) || button === this.ropeButton) return;
    this.release();
    this.ropeButton = button;
  }

  /** Poll once per display frame, including while paused so Start can resume. */
  poll(pads: readonly (GamepadState | null)[]): void {
    const pad = pads.find((p) => p?.connected && p.mapping === 'standard');
    if (!pad) {
      this.release();
      this.index = null;
      return;
    }
    if (this.index !== pad.index) {
      this.release();
      this.index = pad.index;
    }
    const down = (button: number): boolean => {
      const b = pad.buttons[button];
      return b?.pressed === true || (b?.value ?? 0) > 0.5;
    };
    const dpad = Number(down(15)) - Number(down(14));
    const axis = dpad || quantize(pad.axes[0] ?? 0);
    const x = finiteAxis(pad.axes[2] ?? 0);
    const y = finiteAxis(pad.axes[3] ?? 0);
    const direction =
      Math.hypot(x, y) > 0.2
        ? { x: Math.round(x * 20) / 20, y: Math.round(y * 20) / 20 }
        : { x: 0, y: 0 };
    const jump = down(0);
    const rope = down(this.ropeButton);
    const pause = down(9);
    const directionChanged = direction.x !== this.direction.x || direction.y !== this.direction.y;
    const activity =
      axis !== this.axis ||
      directionChanged ||
      jump !== this.jump ||
      rope !== this.rope ||
      pause !== this.pause;
    if (!activity) return;
    this.onActivity();
    // Switch the sim to pad targeting even when the first action is movement or Jump.
    this.emit({ type: 'ropePoint', direction });
    if (axis !== this.axis) this.emit({ type: 'move', axis });
    if (jump !== this.jump) this.emit({ type: jump ? 'jumpPress' : 'jumpRelease' });
    if (rope !== this.rope) this.emit({ type: rope ? 'ropePress' : 'ropeRelease' });
    if (pause && !this.pause) this.emit({ type: 'pause' });
    this.axis = axis;
    this.direction = direction;
    this.jump = jump;
    this.rope = rope;
    this.pause = pause;
  }

  /** Focus loss, disconnect and remapping release the pad's held intents. */
  release(): void {
    if (this.axis !== 0) this.emit({ type: 'move', axis: 0 });
    if (this.jump) this.emit({ type: 'jumpRelease' });
    if (this.rope) this.emit({ type: 'ropeRelease' });
    this.axis = 0;
    this.jump = false;
    this.rope = false;
    this.pause = false;
    this.direction = { x: 0, y: 0 };
  }
}

function finiteAxis(axis: number): number {
  return Number.isFinite(axis) ? Math.max(-1, Math.min(1, axis)) : 0;
}

function quantize(axis: number): number {
  const value = finiteAxis(axis);
  const magnitude = Math.abs(value);
  if (magnitude <= 0.2) return 0;
  return Math.round(((Math.sign(value) * (magnitude - 0.2)) / 0.8) * 20) / 20;
}
