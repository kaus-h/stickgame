/**
 * The pencil world's painters live in a lazily loaded chunk so per-world art stays out of the
 * initial bundle (budgets.json, GMR-36). Boot awaits loadPencilWorld() alongside the level kit;
 * scene creation then reads the module synchronously, falling back to notebook art if absent.
 */
type PencilModule = typeof import('./pencil');

let loaded: PencilModule | null = null;
let pending: Promise<void> | null = null;

export function loadPencilWorld(): Promise<void> {
  pending ??= import('./pencil').then((module) => {
    loaded = module;
  });
  return pending;
}

export function pencilWorld(): PencilModule | null {
  return loaded;
}
