export interface FilmOptions {
  id: string;
  from: string;
  ticks?: number;
  every: number;
  scale: number;
}
export function parseFilmArgs(argv: string[]): FilmOptions;
export function filmRange(
  options: FilmOptions,
  solution: { totalTicks: number; chambers: { id: string; startTick: number }[] },
): { start: number; end: number };
