import type { StorageService } from '../PlatformServices';
import {
  decodeSave,
  emptySave,
  encodeSave,
  recordRun,
  type PersonalBest,
  type RunResult,
  type SaveData,
  type Settings,
} from './saveData';

const KEY = 'save';
const BACKUP = 'save.bak';

/**
 * Local-first save store (GMR-48). Reads the main copy, falls back to the backup, then to a fresh
 * save. Every write first moves the current good copy to the backup, so a torn write or a bad
 * migration can lose at most the latest change. Writes are serialised and never awaited by
 * gameplay.
 */
export class SaveStore {
  private data: SaveData = emptySave();
  private queue: Promise<void> = Promise.resolve();
  /** Where the loaded data came from, for diagnostics. */
  source: 'main' | 'backup' | 'new' = 'new';

  constructor(private readonly storage: StorageService) {}

  async load(): Promise<SaveData> {
    const main = decodeSave(await this.storage.load(KEY));
    if (main) {
      this.data = main;
      this.source = 'main';
      return main;
    }
    const backup = decodeSave(await this.storage.load(BACKUP));
    if (backup) {
      this.data = backup;
      this.source = 'backup';
      this.persist(); // repair the main copy from the backup
      return backup;
    }
    this.data = emptySave();
    this.source = 'new';
    return this.data;
  }

  get current(): SaveData {
    return this.data;
  }

  /** Record a finished run (a clear, or deaths before quitting/changing level). */
  recordRun(levelId: string, run: RunResult): void {
    this.data = {
      ...this.data,
      levels: { ...this.data.levels, [levelId]: recordRun(this.data.levels[levelId], run) },
    };
    this.persist();
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data = { ...this.data, settings: { ...this.data.settings, ...patch } };
    this.persist();
  }

  /** Store a new personal best (GMR-103); the caller decides that it beats the old one. */
  setPersonalBest(levelId: string, pb: PersonalBest): void {
    this.data = { ...this.data, pbs: { ...this.data.pbs, [levelId]: pb } };
    this.persist();
  }

  /** Drop a personal best whose replay no longer fits the level or build (GMR-103). */
  clearPersonalBest(levelId: string): void {
    if (!(levelId in this.data.pbs)) return;
    const pbs = { ...this.data.pbs };
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- a keyed record by design
    delete pbs[levelId];
    this.data = { ...this.data, pbs };
    this.persist();
  }

  /** Resolves when every queued write has finished (tests and app shutdown). */
  flush(): Promise<void> {
    return this.queue;
  }

  private persist(): void {
    const text = encodeSave(this.data);
    this.queue = this.queue.then(async () => {
      try {
        const previous = await this.storage.load(KEY);
        if (previous !== null && decodeSave(previous)) await this.storage.save(BACKUP, previous);
        await this.storage.save(KEY, text);
      } catch {
        // Storage failures never reach gameplay; the in-memory copy stays authoritative.
      }
    });
  }
}
