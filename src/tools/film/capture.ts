/**
 * Film capture (GMR-115). `npm run film` (scripts/film.mjs) imports this module into the dev page
 * and calls `film()`. It replays a solver route through the real renderer one fixed tick at a
 * time, so frames land on a tick cadence instead of wall-clock: the same route always films the
 * same frames. Output is an animated GIF plus a contact sheet of evenly spaced frames.
 */
import { applyPalette, GIFEncoder, quantize } from 'gifenc';

interface FilmHook {
  playReplay(text: string): number;
  filmStep(ticks: number): void;
}

export interface FilmLabel {
  /** Route tick where the label starts applying. */
  readonly tick: number;
  readonly text: string;
}

export interface FilmOptions {
  /** Encoded replay (content/solutions/<level>.json `replay`). */
  readonly replay: string;
  /** First and last (exclusive) route ticks to capture. */
  readonly from: number;
  readonly to: number;
  /** Ticks between captured frames (60 Hz sim: 4 = 15 fps). */
  readonly every: number;
  /** Frame size as a fraction of the game canvas. */
  readonly scale: number;
  /** Contact sheet: frame count, columns and maximum width. */
  readonly sheetFrames: number;
  readonly sheetColumns: number;
  readonly sheetWidth: number;
  /** Chamber names by start tick, for the sheet's tile labels. */
  readonly labels: readonly FilmLabel[];
  readonly title: string;
  /** GIF palette size per frame; fewer colours flatten paper grain and shrink the file. */
  readonly colors: number;
}

export interface FilmResult {
  /** GIF file, base64. */
  readonly gif: string;
  /** Contact sheet, PNG data URL. */
  readonly sheet: string;
  readonly frames: number;
  readonly width: number;
  readonly height: number;
  readonly ms: number;
}

const SIM_HZ = 60;

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (!c) throw new Error('No 2D context');
  return c;
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function labelAt(labels: readonly FilmLabel[], tick: number): string {
  let text = '';
  for (const l of labels) if (l.tick <= tick) text = l.text;
  return text;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Paper colour (render/page PAGE.paper) and how close a pixel must be to count as paper. */
const PAPER = [243, 239, 230] as const;
const PAPER_TOLERANCE = 22;
/** Per-channel difference under which a GIF pixel counts as unchanged. */
const SAME = 6;

/**
 * GIF only: snap near-paper pixels (grain, fibres, faint ruling) to flat paper. The grain is most
 * of a frame's entropy, and motion reads the same without it; the contact sheet keeps it.
 */
function flattenPaper(rgba: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4)
    if (
      Math.abs((rgba[i] ?? 0) - PAPER[0]) < PAPER_TOLERANCE &&
      Math.abs((rgba[i + 1] ?? 0) - PAPER[1]) < PAPER_TOLERANCE &&
      Math.abs((rgba[i + 2] ?? 0) - PAPER[2]) < PAPER_TOLERANCE
    ) {
      rgba[i] = PAPER[0];
      rgba[i + 1] = PAPER[1];
      rgba[i + 2] = PAPER[2];
    }
}

/** Frame indices for the contact sheet: evenly spaced, first and last included. */
export function sheetPicks(frames: number, count: number): number[] {
  if (frames <= 0) return [];
  const n = Math.min(frames, count);
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => Math.round((i * (frames - 1)) / (n - 1)));
}

export async function film(o: FilmOptions): Promise<FilmResult> {
  const t0 = performance.now();
  const hook = (window as unknown as { __stickgame: FilmHook }).__stickgame;
  const source = document.querySelector<HTMLCanvasElement>('#game canvas');
  if (!source) throw new Error('No game canvas');
  const width = Math.max(2, Math.round(source.width * o.scale));
  const height = Math.max(2, Math.round(source.height * o.scale));
  const frame = canvas(width, height);
  const fc = context(frame);
  fc.imageSmoothingQuality = 'high';

  const frames = Math.max(1, Math.floor((o.to - o.from) / o.every));
  const picks = sheetPicks(frames, o.sheetFrames);
  const cols = Math.min(o.sheetColumns, picks.length);
  const tileW = Math.min(width, Math.floor(o.sheetWidth / cols));
  const tileH = Math.round((tileW * height) / width);
  const header = 26;
  const rows = Math.ceil(picks.length / cols);
  const sheet = canvas(cols * tileW, header + rows * tileH);
  const sc = context(sheet);
  sc.fillStyle = '#1d1d22';
  sc.fillRect(0, 0, sheet.width, sheet.height);
  sc.font = '600 14px system-ui, sans-serif';
  sc.fillStyle = '#f3efe6';
  sc.textBaseline = 'middle';
  sc.fillText(o.title, 8, header / 2);

  const gif = GIFEncoder();
  const written = new Uint8ClampedArray(width * height * 4);
  const delay = Math.round((o.every * 1000) / SIM_HZ);

  // The replay restarts the level on its first tick; fast-forward to the first filmed tick.
  hook.playReplay(o.replay);
  hook.filmStep(o.from);
  let pick = 0;
  for (let i = 0; i < frames; i++) {
    hook.filmStep(o.every);
    // Read the canvas in the same task as the render, before the browser presents and clears it.
    fc.drawImage(source, 0, 0, width, height);
    const { data } = fc.getImageData(0, 0, width, height);
    flattenPaper(data);
    // One palette slot is kept for "unchanged since the last written pixel" (transparent), so a
    // still camera costs almost nothing. Comparing against the last written source value keeps
    // the error bounded by the tolerance instead of letting it drift.
    const palette = quantize(data, o.colors - 1, { format: 'rgb444' });
    const index = applyPalette(data, palette, 'rgb444');
    const clear = palette.length;
    for (let p = 0, q = 0; p < index.length; p++, q += 4) {
      if (
        i > 0 &&
        Math.abs((data[q] ?? 0) - (written[q] ?? 0)) <= SAME &&
        Math.abs((data[q + 1] ?? 0) - (written[q + 1] ?? 0)) <= SAME &&
        Math.abs((data[q + 2] ?? 0) - (written[q + 2] ?? 0)) <= SAME
      )
        index[p] = clear;
      else {
        written[q] = data[q] ?? 0;
        written[q + 1] = data[q + 1] ?? 0;
        written[q + 2] = data[q + 2] ?? 0;
      }
    }
    palette.push([0, 0, 0]);
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      transparent: true,
      transparentIndex: clear,
      dispose: 1,
    });

    if (picks[pick] === i) {
      const col = pick % cols;
      const row = Math.floor(pick / cols);
      const x = col * tileW;
      const y = header + row * tileH;
      sc.drawImage(frame, x, y, tileW, tileH);
      const tick = o.from + (i + 1) * o.every;
      const text = `${(tick / SIM_HZ).toFixed(2)}s  t${String(tick)}  ${labelAt(o.labels, tick)}`;
      sc.font = '600 12px system-ui, sans-serif';
      const tw = sc.measureText(text).width;
      sc.fillStyle = 'rgba(20, 20, 24, 0.72)';
      sc.fillRect(x + 4, y + 4, tw + 10, 18);
      sc.fillStyle = '#f3efe6';
      sc.fillText(text, x + 9, y + 13);
      sc.strokeStyle = '#1d1d22';
      sc.strokeRect(x + 0.5, y + 0.5, tileW - 1, tileH - 1);
      pick++;
    }
    // Let the page breathe now and then; capture always follows its own render step.
    if (i % 30 === 29)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
  }
  gif.finish();
  return {
    gif: base64(gif.bytes()),
    sheet: sheet.toDataURL('image/png'),
    frames,
    width,
    height,
    ms: Math.round(performance.now() - t0),
  };
}
