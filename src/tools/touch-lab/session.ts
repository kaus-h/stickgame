import { SeededRng, vec2, type AssistMode, type Vec2 } from '../../core';
import { resolveTarget, type TargetAssist } from '../../sim';
import type { RopeTuning } from '../../sim';

/**
 * Target-acquisition session for the touch lab (GMR-27). Pure logic: the page feeds it times,
 * aims and touches; it keeps per-trial records and summary metrics. Selection uses the game's own
 * resolveTarget with the chosen assist tier, so "hit" means exactly what a rope press would select.
 * Rope range and line of sight are ignored on purpose: the lab measures aiming only.
 */

export interface LabTrialSpec {
  /** World m. */
  readonly target: Vec2;
  /** Other anchors on screen, so wide-select and snap can pick the wrong one. */
  readonly decoys: readonly Vec2[];
}

/** A touch at press time, CSS px, with its role from the touch mapper. */
export interface LabTouch {
  readonly x: number;
  readonly y: number;
  readonly role: string;
}

export interface LabPress {
  readonly atMs: number;
  /** World m. */
  readonly aim: Vec2;
  /** Aim error: aim to target centre, m and CSS px. */
  readonly errorM: number;
  readonly errorPx: number;
  /** What the press selected: 'target', 'decoy' or 'none'. */
  readonly selected: 'target' | 'decoy' | 'none';
  readonly snapped: boolean;
  /** A finger was over the target (within occlusionPx of its centre) when the press landed. */
  readonly occluded: boolean;
  /** A move touch was held at the same time (overlap). */
  readonly moveHeld: boolean;
}

export interface LabTrial {
  readonly index: number;
  readonly target: Vec2;
  readonly shownAtMs: number;
  /** First press that selected the target, ms after the target appeared; null = not acquired. */
  readonly acquisitionMs: number | null;
  readonly misses: number;
  readonly timedOut: boolean;
  readonly presses: readonly LabPress[];
}

export interface LabSummary {
  readonly trials: number;
  readonly acquired: number;
  readonly timeouts: number;
  readonly presses: number;
  readonly misses: number;
  /** misses / presses. */
  readonly missRate: number;
  readonly medianAcquisitionMs: number | null;
  readonly p90AcquisitionMs: number | null;
  readonly meanErrorM: number | null;
  readonly meanErrorPx: number | null;
  /** Share of presses where a finger covered the target. */
  readonly occlusionRate: number;
  /** Share of presses selected by the snap assist. */
  readonly snapRate: number;
  /** Share of presses made while a move touch was held. */
  readonly overlapRate: number;
}

export interface LabConfig {
  readonly scheme: string;
  readonly moveStyle: string;
  readonly assist: TargetAssist;
  readonly rope: RopeTuning;
  readonly anchorRadius: number;
  /** CSS px per world m (the game's camera scale for this viewport). */
  readonly pxPerM: number;
  /** A finger covers a target whose centre is within this many CSS px of the touch. */
  readonly occlusionPx: number;
  readonly timeoutMs: number;
  /** World to CSS px for the occlusion test. */
  readonly worldToScreen: (p: Vec2) => Vec2;
}

/** Seeded trial layout: same seed, viewport and avoid-test give the same targets on every device. */
export function generateTrials(
  seed: number,
  count: number,
  area: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
  avoid: (p: Vec2) => boolean,
  decoys = 2,
  minSeparation = 2.5,
): LabTrialSpec[] {
  const rng = new SeededRng(seed);
  const pick = (others: readonly Vec2[]): Vec2 => {
    let best = vec2((area.x0 + area.x1) / 2, (area.y0 + area.y1) / 2);
    for (let tries = 0; tries < 200; tries++) {
      const p = vec2(
        area.x0 + rng.next() * (area.x1 - area.x0),
        area.y0 + rng.next() * (area.y1 - area.y0),
      );
      best = p;
      if (avoid(p)) continue;
      if (others.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < minSeparation)) continue;
      return p;
    }
    return best;
  };
  const out: LabTrialSpec[] = [];
  for (let i = 0; i < count; i++) {
    const target = pick([]);
    const others: Vec2[] = [target];
    for (let k = 0; k < decoys; k++) others.push(pick(others));
    out.push({ target, decoys: others.slice(1) });
  }
  return out;
}

export class AcquisitionSession {
  private readonly trials: LabTrial[] = [];
  private current: {
    index: number;
    spec: LabTrialSpec;
    shownAtMs: number;
    presses: LabPress[];
  } | null = null;
  private next = 0;

  constructor(
    readonly config: LabConfig,
    readonly specs: readonly LabTrialSpec[],
    /** Player position used for selection distance (range is ignored), world m. */
    private readonly player: Vec2,
  ) {}

  get done(): boolean {
    return this.next >= this.specs.length && !this.current;
  }

  /** The trial on screen, if any. */
  get active(): LabTrialSpec | null {
    return this.current?.spec ?? null;
  }

  /** Show the next target at `nowMs`. Returns false when every trial has run. */
  begin(nowMs: number): boolean {
    if (this.current) return true;
    const spec = this.specs[this.next];
    if (!spec) return false;
    this.current = { index: this.next, spec, shownAtMs: nowMs, presses: [] };
    this.next++;
    return true;
  }

  /** A rope press landed. Returns what it selected; a target hit ends the trial. */
  press(nowMs: number, aim: Vec2, touches: readonly LabTouch[]): LabPress | null {
    const c = this.current;
    if (!c) return null;
    const anchors = [c.spec.target, ...c.spec.decoys].map((position) => ({
      position,
      radius: this.config.anchorRadius,
    }));
    const r = resolveTarget(
      this.player,
      aim,
      anchors,
      this.config.rope,
      () => null,
      this.config.assist,
    );
    const t = c.spec.target;
    const errorM = Math.hypot(aim.x - t.x, aim.y - t.y);
    const ts = this.config.worldToScreen(t);
    const press: LabPress = {
      atMs: nowMs - c.shownAtMs,
      aim,
      errorM,
      errorPx: errorM * this.config.pxPerM,
      selected: r.anchor === null ? 'none' : r.anchor === 0 ? 'target' : 'decoy',
      snapped: r.snapped,
      occluded: touches.some((p) => Math.hypot(p.x - ts.x, p.y - ts.y) <= this.config.occlusionPx),
      moveHeld: touches.some((p) => p.role === 'move'),
    };
    c.presses.push(press);
    if (press.selected === 'target') this.finish(nowMs, false);
    return press;
  }

  /** Call every frame: ends the trial when it has been on screen longer than the timeout. */
  tick(nowMs: number): void {
    const c = this.current;
    if (c && nowMs - c.shownAtMs >= this.config.timeoutMs) this.finish(nowMs, true);
  }

  results(): readonly LabTrial[] {
    return this.trials;
  }

  summary(): LabSummary {
    return summarize(this.trials);
  }

  private finish(nowMs: number, timedOut: boolean): void {
    const c = this.current;
    if (!c) return;
    this.trials.push({
      index: c.index,
      target: c.spec.target,
      shownAtMs: c.shownAtMs,
      acquisitionMs: timedOut ? null : nowMs - c.shownAtMs,
      misses: c.presses.filter((p) => p.selected !== 'target').length,
      timedOut,
      presses: c.presses,
    });
    this.current = null;
  }
}

export function summarize(trials: readonly LabTrial[]): LabSummary {
  const presses = trials.flatMap((t) => t.presses);
  const times = trials
    .map((t) => t.acquisitionMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const misses = presses.filter((p) => p.selected !== 'target').length;
  const share = (f: (p: LabPress) => boolean): number =>
    presses.length ? presses.filter(f).length / presses.length : 0;
  const mean = (xs: readonly number[]): number | null =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const quantile = (q: number): number | null =>
    times.length ? (times[Math.min(times.length - 1, Math.floor(q * times.length))] ?? null) : null;
  return {
    trials: trials.length,
    acquired: times.length,
    timeouts: trials.filter((t) => t.timedOut).length,
    presses: presses.length,
    misses,
    missRate: presses.length ? misses / presses.length : 0,
    medianAcquisitionMs: quantile(0.5),
    p90AcquisitionMs: quantile(0.9),
    meanErrorM: mean(presses.map((p) => p.errorM)),
    meanErrorPx: mean(presses.map((p) => p.errorPx)),
    occlusionRate: share((p) => p.occluded),
    snapRate: share((p) => p.snapped),
    overlapRate: share((p) => p.moveHeld),
  };
}

/** One exported run: everything needed to compare schemes across devices. */
export interface LabRunExport {
  readonly scheme: string;
  readonly moveStyle: string;
  readonly assist: AssistMode;
  readonly seed: number;
  readonly summary: LabSummary;
  readonly trials: readonly LabTrial[];
}
