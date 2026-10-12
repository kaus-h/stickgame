export function selectFrameTicks(
  startTick: number,
  endTick: number,
  every?: number,
  maxFrames?: number,
): number[];
export function selectSheetFrames(frameTicks: number[], maxFrames?: number): number[];
export interface FilmGrid {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  labelHeight: number;
  gap: number;
  padding: number;
  width: number;
  height: number;
  cells: { x: number; y: number; labelY: number }[];
}
export function layoutGrid(
  frameCount: number,
  frameWidth: number,
  frameHeight: number,
  maxWidth?: number,
): FilmGrid;
