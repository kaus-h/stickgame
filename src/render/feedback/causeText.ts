import type { DeathCause } from '../../sim';

/** Additive GMR-43 reconciliation hook: keep its existing (cause, solid) call contract. */
export function causeText(cause: DeathCause, solid: string | null): string {
  if (cause === 'enemy-contact') return 'goon contact — aim for the flat top';
  if (cause === 'out-of-bounds') return 'fell off the page';
  const id = (solid ?? '').toLowerCase();
  if (id.includes('thorn') || id.includes('spike') || id.includes('teeth')) return 'spikes!';
  if (id.includes('floor') || id.includes('lava') || id.includes('pit')) return 'red ink = danger';
  return 'touched red ink';
}
