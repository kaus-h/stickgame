/** Local playtest event contract. No account, device, network or persistent player identifiers. */
export type TelemetryEvent =
  | {
      readonly name: 'attempt_start';
      readonly tick: number;
      readonly props: {
        readonly levelId: string;
        readonly life: number;
        readonly fromCheckpoint: boolean;
      };
    }
  | {
      readonly name: 'death';
      readonly tick: number;
      readonly props: {
        readonly levelId: string;
        readonly chamberId: string;
        readonly cause: string;
        readonly x: number;
        readonly y: number;
        readonly lifeTicks: number;
        readonly ropeAttached: boolean;
      };
    }
  | {
      readonly name: 'rope_attach';
      readonly tick: number;
      readonly props: {
        readonly levelId: string;
        readonly chamberId: string;
        readonly anchorId: string;
        readonly length: number;
        /** Null only if the final frame snapshot no longer contains the attachment. */
        readonly impactOffsetX: number | null;
        readonly impactOffsetY: number | null;
        readonly vx: number;
        readonly vy: number;
        readonly grounded: boolean;
      };
    }
  | {
      readonly name: 'rope_release';
      readonly tick: number;
      readonly props: {
        readonly levelId: string;
        readonly chamberId: string;
        readonly anchorId: string;
        readonly vx: number;
        readonly vy: number;
        readonly heldTicks: number;
        readonly cause: 'player' | 'timed';
      };
    }
  | {
      readonly name: 'rope_invalid';
      readonly tick: number;
      readonly props: {
        readonly levelId: string;
        readonly chamberId: string;
        readonly reason: string;
        readonly x: number;
        readonly y: number;
      };
    }
  | {
      readonly name: 'chamber_enter';
      readonly tick: number;
      readonly props: {
        readonly levelId: string;
        readonly chamberId: string;
        readonly firstThisRun: boolean;
        readonly runTicks: number;
      };
    }
  | {
      readonly name: 'checkpoint';
      readonly tick: number;
      readonly props: {
        readonly levelId: string;
        readonly checkpointId: string;
        readonly runTicks: number;
        readonly lifeCount: number;
      };
    }
  | {
      readonly name: 'level_complete';
      readonly tick: number;
      readonly props: {
        readonly levelId: string;
        readonly runTicks: number;
        readonly deaths: number;
        readonly lives: number;
      };
    }
  | {
      readonly name: 'quit';
      readonly tick: number;
      readonly props: {
        readonly levelId: string;
        readonly chamberId: string;
        readonly runTicks: number;
      };
    };

export type EventName = TelemetryEvent['name'];

/** Every event must support a named question from design canon 08. */
export const QUESTIONS: Record<EventName, string> = {
  attempt_start: 'How many lives does a level take?',
  death: 'Where and why do players die (death heatmap; which chambers are unfair)?',
  rope_attach:
    'Which anchors are used, at what rope lengths (tether heatmap, rope-length distribution)?',
  rope_release: 'Is release timing learnable (release-speed spread per chamber)?',
  rope_invalid: "Are players aiming at things that look like anchors but aren't, or out of range?",
  chamber_enter: 'Where do players drop off, and how much time do they spend per chamber?',
  checkpoint: 'Do checkpoints sit where players need them?',
  level_complete: 'What is time to first clear and deaths per level (difficulty curve)?',
  quit: 'Where do players give up?',
};
