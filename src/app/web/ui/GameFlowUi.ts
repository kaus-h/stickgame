import type { SaveData, Settings } from '../../../platform';
import { ControlsPanel } from './ControlsPanel';
import { DELTA_COLOURS, formatDelta } from '../../../render/race';
import {
  continueLevel,
  formatTicks,
  isUnlocked,
  nextLevel,
  t,
  type Chapter,
  type ChapterLevel,
  type Strings,
} from './flow';

export type Screen = 'title' | 'levels' | 'playing' | 'paused' | 'results' | 'settings';

export interface FlowActions {
  /** Start (or switch to) a level from its first attempt. */
  play(levelId: string): void;
  /** Restart the current level's attempt. */
  restart(): void;
  /** Respawn at the last reached checkpoint (GMR-103); restart if none was reached. */
  respawn(): void;
  /** Pause or resume the simulation for the menus. */
  setMenuPaused(paused: boolean): void;
  /** Settings changed (persist and apply). */
  settings(patch: Partial<Settings>): void;
  /** Scribble out the death bodies on this level (GMR-104, C). */
  clearBodies(): void;
}

export interface ResultsInfo {
  readonly levelId: string;
  readonly ticks: number;
  readonly deaths: number;
  readonly newBest: boolean;
  /** Run time minus the previous PB (GMR-103); null when this is the first PB. */
  readonly pbDelta?: number | null;
  /** Lives played in the run. */
  readonly lives?: number;
  readonly bestLifeTicks?: number;
  /** Total level time until this first clear; only on the first clear. */
  readonly firstClearTicks?: number | null;
  /** Per-checkpoint splits, then the finish, with the PB split where there is one. */
  readonly splits?: readonly ResultSplit[];
}

export interface ResultSplit {
  /** Checkpoint index, or -1 for the finish. */
  readonly index: number;
  readonly ticks: number | null;
  readonly pbTicks: number | null;
}

const CSS = `
.flow { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(243, 239, 230, 0.86); font-family: "Caveat", cursive; color: #16161a; z-index: 20;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
.flow[hidden] { display: none; }
.flow-card { min-width: min(420px, 86vw); max-width: 92vw; max-height: 88vh; overflow: auto; padding: 18px 28px 22px;
  background: #f3efe6; border: 2.5px solid #16161a; border-radius: 6px 10px 7px 12px;
  box-shadow: 4px 5px 0 rgba(22, 22, 26, 0.18); text-align: center; }
.flow h1 { font-size: 64px; margin: 4px 0 0; line-height: 1; }
.flow h2 { font-size: 40px; margin: 4px 0 10px; line-height: 1.05; }
.flow .tag { font-size: 24px; color: #5a5a5a; margin: 0 0 14px; }
.flow .row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 10px; }
.flow button { font: inherit; font-size: 30px; color: #16161a; background: none; border: 2px solid #16161a;
  border-radius: 14px 9px 13px 8px; padding: 4px 18px; cursor: pointer; min-height: 48px; }
.flow button:hover, .flow button:focus-visible { background: rgba(255, 225, 74, 0.55); outline: none; }
.flow button.primary { border-width: 3px; }
.flow button:disabled { color: #8a8a8a; border-color: #8a8a8a; border-style: dashed; cursor: default; background: none; }
.flow .levels { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin: 8px 0; }
.flow .level { display: flex; flex-direction: column; align-items: center; padding: 6px 8px; }
.flow .level .label { font-size: 34px; }
.flow .level .meta { font-size: 20px; color: #5a5a5a; min-height: 24px; }
.flow .stat { font-size: 30px; margin: 2px 0; }
.flow .best { color: #c5302a; font-size: 24px; }
.flow label.setting { display: flex; align-items: center; justify-content: space-between; gap: 18px; font-size: 28px; margin: 6px 0; }
.flow input[type=range] { width: 160px; accent-color: #16161a; }
.flow select { font: inherit; font-size: 24px; background: none; border: 2px solid #16161a; border-radius: 8px; }
.flow input[type=checkbox] { width: 24px; height: 24px; accent-color: #16161a; }
.flow .delta { font-size: 28px; margin: 0 0 4px; }
.flow table.splits { margin: 6px auto 4px; border-collapse: collapse; font-size: 24px; }
.flow table.splits th { font-weight: normal; color: #5a5a5a; padding: 0 10px; }
.flow table.splits td { padding: 0 10px; text-align: right; }
.flow table.splits td:first-child { text-align: left; }
`;

/**
 * Title, level select, pause, results and settings as an HTML overlay in the notebook style
 * (GMR-47). HTML keeps it keyboard-, touch- and screen-reader-friendly; strings come from
 * content/strings. The overlay never appears between death and retry: only on request (pause),
 * after an accepted exit (results) or before play (title, levels).
 */
export class GameFlowUi {
  screen: Screen = 'title';
  private readonly root: HTMLDivElement;
  private currentLevel: string | null = null;
  private settingsReturn: Screen = 'title';
  /** Key remapping (GMR-50); lives only while the settings screen is shown. */
  private controls: ControlsPanel | null = null;

  constructor(
    host: HTMLElement,
    private readonly strings: Strings,
    private readonly chapter: Chapter,
    private readonly save: () => SaveData,
    private readonly actions: FlowActions,
  ) {
    if (!document.getElementById('flow-css')) {
      const style = document.createElement('style');
      style.id = 'flow-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'flow';
    this.root.setAttribute('role', 'dialog');
    this.root.hidden = true; // nothing shows until a screen is rendered
    host.append(this.root);
  }

  get level(): string | null {
    return this.currentLevel;
  }

  // --- screens -----------------------------------------------------------------------------------

  showTitle(): void {
    const data = this.save();
    const resume = continueLevel(this.chapter, data.levels);
    const started = Object.keys(data.levels).length > 0;
    this.render('title', [
      h('h1', {}, ['StickSwing']),
      h('p', { class: 'tag' }, [this.s('title.tagline')]),
      row(
        button(
          started ? this.s('title.continue', { level: resume.label }) : this.s('title.play'),
          () => {
            this.startLevel(resume.id);
          },
          true,
        ),
        button(this.s('title.levels'), () => {
          this.showLevels();
        }),
        button(this.s('title.settings'), () => {
          this.showSettings('title');
        }),
      ),
    ]);
  }

  showLevels(): void {
    const data = this.save();
    const sections = this.chapter.sections.map((section, si) => {
      const cards = section.levels.map((l) => this.levelCard(l, data));
      return [
        h('p', { class: 'tag' }, [this.s('levels.section', { n: si + 1 })]),
        h('div', { class: 'levels' }, cards),
      ];
    });
    this.render('levels', [
      h('h2', {}, [this.s('levels.heading')]),
      ...sections.flat(),
      row(
        button(this.s('levels.back'), () => {
          this.showTitle();
        }),
      ),
    ]);
  }

  /** In-game pause menu (Esc / P / touch pause). */
  showPause(): void {
    if (this.screen !== 'playing') return;
    this.actions.setMenuPaused(true);
    this.render('paused', [
      h('h2', {}, [this.s('pause.heading')]),
      row(
        button(
          this.s('pause.resume'),
          () => {
            this.resume();
          },
          true,
        ),
        button(this.s('pause.restart'), () => {
          this.actions.restart();
          this.resume();
        }),
        button(this.s('pause.respawn'), () => {
          this.actions.respawn();
          this.resume();
        }),
      ),
      row(
        button(this.s('pause.settings'), () => {
          this.showSettings('paused');
        }),
        button(this.s('pause.levels'), () => {
          this.showLevels();
        }),
      ),
      // Death bodies (GMR-104): the touch route to B and C. Both resume so the effect is seen.
      row(
        button(
          this.s(this.save().settings.bodies ? 'pause.hideBodies' : 'pause.showBodies'),
          () => {
            this.resume();
            this.actions.settings({ bodies: !this.save().settings.bodies });
          },
        ),
        button(this.s('pause.clearBodies'), () => {
          this.resume();
          this.actions.clearBodies();
        }),
      ),
    ]);
  }

  /** After an accepted exit only: the player has finished; results never interrupt a retry. */
  showResults(r: ResultsInfo): void {
    this.actions.setMenuPaused(true);
    const label = this.labelOf(r.levelId);
    const next = nextLevel(this.chapter, r.levelId);
    const deaths =
      r.deaths === 0
        ? this.s('results.deathless')
        : r.deaths === 1
          ? this.s('results.deaths1')
          : this.s('results.deaths', { n: r.deaths });
    const lives =
      r.lives === undefined
        ? null
        : r.lives === 1
          ? this.s('results.lives1')
          : this.s('results.lives', { n: r.lives });
    this.render('results', [
      h('h2', {}, [this.s('results.heading', { level: label })]),
      h('p', { class: 'stat', 'data-stat': 'time' }, [
        this.s('results.time', { time: formatTicks(r.ticks) }),
      ]),
      this.pbDeltaLine(r.pbDelta),
      h('p', { class: 'stat' }, [lives ? `${deaths} · ${lives}` : deaths]),
      r.bestLifeTicks !== undefined && (r.lives ?? 1) > 1
        ? h('p', { class: 'tag' }, [
            this.s('results.bestLife', { time: formatTicks(r.bestLifeTicks) }),
          ])
        : null,
      r.firstClearTicks != null
        ? h('p', { class: 'tag', 'data-stat': 'first-clear' }, [
            this.s('results.firstClear', { time: formatTicks(r.firstClearTicks) }),
          ])
        : null,
      r.newBest ? h('p', { class: 'best' }, [this.s('results.newBest')]) : null,
      this.splitsTable(r.splits),
      row(
        next
          ? button(
              this.s('results.next'),
              () => {
                this.startLevel(next.id);
              },
              true,
            )
          : null,
        button(
          this.s('results.retry'),
          () => {
            this.actions.restart();
            this.resume();
          },
          !next,
        ),
        button(this.s('results.levels'), () => {
          this.showLevels();
        }),
      ),
    ]);
  }

  showSettings(returnTo: Screen): void {
    this.settingsReturn = returnTo;
    const s = this.save().settings;
    const slider = (key: 'masterVolume' | 'sfxVolume' | 'musicVolume', label: string) => {
      const input = h(
        'input',
        { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': label },
        [],
      ) as HTMLInputElement;
      input.value = String(s[key]);
      input.oninput = () => {
        this.actions.settings({ [key]: Number(input.value) });
      };
      return h('label', { class: 'setting' }, [label, input]);
    };
    const muted = h(
      'input',
      { type: 'checkbox', 'aria-label': this.s('settings.muted') },
      [],
    ) as HTMLInputElement;
    muted.checked = s.muted;
    muted.onchange = () => {
      this.actions.settings({ muted: muted.checked });
    };
    const select = <T extends string>(
      label: string,
      prefix: string,
      values: readonly T[],
      current: T,
      apply: (v: T) => void,
    ) => {
      const el = h(
        'select',
        { 'aria-label': label },
        values.map((v) => {
          const o = h('option', { value: v }, [this.s(`${prefix}.${v}`)]) as HTMLOptionElement;
          o.selected = v === current;
          return o;
        }),
      ) as HTMLSelectElement;
      el.onchange = () => {
        apply(el.value as T);
      };
      return h('label', { class: 'setting' }, [label, el]);
    };
    const controlsHost = h('div', {}, []);
    this.render('settings', [
      h('h2', {}, [this.s('settings.heading')]),
      slider('masterVolume', this.s('settings.master')),
      slider('sfxVolume', this.s('settings.sfx')),
      slider('musicVolume', this.s('settings.music')),
      h('label', { class: 'setting' }, [this.s('settings.muted'), muted]),
      select(
        this.s('settings.reducedMotion'),
        'settings.reducedMotion',
        ['system', 'on', 'off'] as const,
        s.reducedMotion,
        (v) => {
          this.actions.settings({ reducedMotion: v });
        },
      ),
      this.checkbox(this.s('settings.ghost'), s.ghost, (v) => {
        this.actions.settings({ ghost: v });
      }),
      this.checkbox(this.s('settings.bodies'), s.bodies, (v) => {
        this.actions.settings({ bodies: v });
      }),
      this.checkbox(this.s('settings.highContrast'), s.highContrast, (v) => {
        this.actions.settings({ highContrast: v });
      }),
      this.checkbox(this.s('settings.largeReticle'), s.largeReticle, (v) => {
        this.actions.settings({ largeReticle: v });
      }),
      select(
        this.s('settings.assist'),
        'settings.assist',
        ['standard', 'wide-select', 'snap'] as const,
        s.assist,
        (v) => {
          this.actions.settings({ assist: v });
        },
      ),
      controlsHost,
      row(
        button(
          this.s('settings.back'),
          () => {
            if (this.settingsReturn === 'paused') {
              this.screen = 'playing';
              this.showPause();
            } else this.showTitle();
          },
          true,
        ),
      ),
    ]);
    this.controls = new ControlsPanel(controlsHost, this.strings, s.keyBindings, (keyBindings) => {
      this.actions.settings({ keyBindings });
    });
  }

  /** Start a level from the menus (or after results). */
  startLevel(levelId: string): void {
    this.currentLevel = levelId;
    this.actions.play(levelId);
    this.resume();
  }

  /** Close the menus and run the game. */
  resume(): void {
    this.screen = 'playing';
    this.dropControls();
    this.root.hidden = true;
    this.root.replaceChildren();
    this.actions.setMenuPaused(false);
  }

  /** Esc / P / touch pause: toggle between playing and the pause menu; back out of submenus. */
  onPauseKey(): void {
    if (this.screen === 'playing') this.showPause();
    else if (this.screen === 'paused') this.resume();
    else if (this.screen === 'settings' && this.settingsReturn === 'paused') {
      this.screen = 'playing';
      this.showPause();
    }
  }

  // --- helpers -----------------------------------------------------------------------------------

  /** "vs PB −0.42" in blue pen, "+0.42" in red pen; the sign always carries the meaning too. */
  private pbDeltaLine(delta: number | null | undefined): HTMLElement | null {
    if (delta === undefined) return null;
    if (delta === null) return h('p', { class: 'delta' }, [this.s('results.firstPb')]);
    return h('p', { class: 'delta', 'data-stat': 'pb-delta' }, [
      `${this.s('results.pbDelta')} `,
      this.deltaSpan(delta),
    ]);
  }

  private deltaSpan(delta: number): HTMLElement {
    const d = formatDelta(delta);
    const span = h('span', { 'data-tone': d.tone }, [d.text]);
    span.style.color = DELTA_COLOURS[d.tone];
    return span;
  }

  private splitsTable(splits: readonly ResultSplit[] | undefined): HTMLElement | null {
    if (!splits || splits.length < 2) return null; // the finish alone repeats the run time
    const head = h('tr', {}, [
      h('th', {}, [this.s('results.splits')]),
      h('th', {}, [this.s('results.split.time')]),
      h('th', {}, [this.s('results.split.delta')]),
    ]);
    const rows = splits.map((sp) =>
      h('tr', {}, [
        h('td', {}, [
          sp.index < 0
            ? this.s('results.split.finish')
            : this.s('results.split.checkpoint', { n: sp.index + 1 }),
        ]),
        h('td', {}, [sp.ticks === null ? '—' : formatTicks(sp.ticks)]),
        h('td', {}, [
          sp.ticks !== null && sp.pbTicks !== null ? this.deltaSpan(sp.ticks - sp.pbTicks) : '—',
        ]),
      ]),
    );
    return h('table', { class: 'splits' }, [head, ...rows]);
  }

  private levelCard(l: ChapterLevel, data: SaveData): HTMLElement {
    const unlocked = isUnlocked(this.chapter, l.id, data.levels);
    const rec = data.levels[l.id];
    const meta = !unlocked
      ? this.s('levels.locked')
      : rec?.bestTicks != null
        ? this.s('levels.best', { time: formatTicks(rec.bestTicks) })
        : '';
    const b = button(`${l.label}${rec?.cleared ? ' ✓' : ''}`, () => {
      this.startLevel(l.id);
    });
    b.disabled = !unlocked;
    b.dataset.level = l.id;
    return h('div', { class: 'level' }, [b, h('span', { class: 'meta' }, [meta])]);
  }

  private checkbox(label: string, value: boolean, apply: (v: boolean) => void): HTMLElement {
    const input = h('input', { type: 'checkbox', 'aria-label': label }, []) as HTMLInputElement;
    input.checked = value;
    input.onchange = () => {
      apply(input.checked);
    };
    return h('label', { class: 'setting' }, [label, input]);
  }

  private labelOf(levelId: string): string {
    for (const s of this.chapter.sections)
      for (const l of s.levels) if (l.id === levelId) return l.label;
    return levelId;
  }

  private s(key: string, vars?: Readonly<Record<string, string | number>>): string {
    return t(this.strings, key, vars);
  }

  private dropControls(): void {
    this.controls?.destroy();
    this.controls = null;
  }

  private render(screen: Screen, children: (Node | null)[]): void {
    this.dropControls();
    this.screen = screen;
    const card = h('div', { class: 'flow-card' }, children);
    this.root.replaceChildren(card);
    this.root.hidden = false;
    this.root.dataset.screen = screen;
    // Keyboard first: focus the primary action.
    const primary =
      card.querySelector<HTMLButtonElement>('button.primary:not(:disabled)') ??
      card.querySelector<HTMLButtonElement>('button:not(:disabled)');
    primary?.focus();
  }
}

function h(
  tag: string,
  attrs: Readonly<Record<string, string>>,
  children: readonly (Node | string | null)[],
): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c !== null) el.append(c);
  return el;
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = h('button', { type: 'button' }, [label]) as HTMLButtonElement;
  if (primary) b.classList.add('primary');
  b.onclick = onClick;
  return b;
}

function row(...items: (Node | null)[]): HTMLElement {
  return h('div', { class: 'row' }, items);
}
