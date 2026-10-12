// Passive, local-first telemetry. Only the app composition root may enable recording.
export { TelemetryDirector } from './TelemetryDirector';
export { PlaytestRecorder } from './PlaytestRecorder';
export { QUESTIONS } from './schema';
export type { EventName, TelemetryEvent } from './schema';
export { exitTelemetry } from './exitTelemetry';
export type { ExitTelemetryEvent } from './exitTelemetry';
export { enemyTelemetry } from './enemyTelemetry';
export type { EnemyTelemetryEvent } from './enemyTelemetry';
