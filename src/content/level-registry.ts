import type { LevelDef } from '../sim';
import { LevelError, parseLevel } from './level';
import { validateLevelAuthoring } from './validate-level';

/** Atomic catalog of compiled levels. IDs survive renames and drive links/telemetry. */
export class LevelRegistry {
  private levels = new Map<string, LevelDef>();

  constructor(sources: Readonly<Record<string, unknown>>) {
    this.replace(sources);
  }

  get ids(): readonly string[] {
    return [...this.levels.keys()].sort();
  }

  load(id: string): LevelDef {
    const level = this.levels.get(id);
    if (!level)
      throw new LevelError(`level.id: unknown "${id}"; available: ${this.ids.join(', ')}`);
    return level;
  }

  replace(sources: Readonly<Record<string, unknown>>): void {
    const next = new Map<string, LevelDef>();
    const telemetryIds = new Set<string>();
    for (const path of Object.keys(sources).sort()) {
      const errors = validateLevelAuthoring(sources[path]).filter(
        (issue) => issue.severity === 'error',
      );
      if (errors.length > 0) {
        throw new LevelError(
          errors.map((issue) => `${path}: ${issue.path}: ${issue.message}`).join('\n'),
        );
      }
      const level = parseLevel(sources[path]);
      if (next.has(level.id)) throw new LevelError(`${path}: duplicate level id "${level.id}"`);
      const telemetryId = level.telemetry?.levelId ?? level.id;
      if (telemetryIds.has(telemetryId))
        throw new LevelError(`${path}: duplicate level telemetry id "${telemetryId}"`);
      telemetryIds.add(telemetryId);
      next.set(level.id, level);
    }
    this.levels = next;
  }
}
