// Layer rules from Linear doc 30 (Software Architecture & Repository Plan).
// A violation here means the change breaks the architecture, not the linter: fix the import.

const layer = (name) => `^src/${name}/`;
const anyOf = (...names) => `^src/(${names.join('|')})/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-is-a-leaf',
      comment: 'core imports nothing else from src.',
      severity: 'error',
      from: { path: layer('core') },
      to: { path: '^src/', pathNot: layer('core') },
    },
    {
      name: 'physics-only-core',
      severity: 'error',
      from: { path: layer('physics') },
      to: { path: '^src/', pathNot: anyOf('core', 'physics') },
    },
    {
      name: 'sim-only-core-and-physics-interface',
      comment:
        'sim never imports render, input, audio, telemetry, platform, content, tools or app, and never a concrete physics backend.',
      severity: 'error',
      from: { path: layer('sim') },
      to: { path: '^src/', pathNot: anyOf('core', 'sim', 'physics') },
    },
    {
      name: 'sim-not-physics-backends',
      severity: 'error',
      from: { path: layer('sim') },
      to: { path: '^src/physics/backends/' },
    },
    {
      name: 'content-only-core-and-sim-types',
      severity: 'error',
      from: { path: layer('content') },
      to: { path: '^src/', pathNot: anyOf('core', 'sim', 'content') },
    },
    {
      name: 'input-only-core',
      severity: 'error',
      from: { path: layer('input') },
      to: { path: '^src/', pathNot: anyOf('core', 'input') },
    },
    {
      name: 'render-only-core-sim-content',
      severity: 'error',
      from: { path: layer('render') },
      to: { path: '^src/', pathNot: anyOf('core', 'sim', 'content', 'render') },
    },
    {
      name: 'audio-only-core-and-sim-types',
      severity: 'error',
      from: { path: layer('audio') },
      to: { path: '^src/', pathNot: anyOf('core', 'sim', 'audio') },
    },
    {
      name: 'telemetry-only-core-and-sim-types',
      severity: 'error',
      from: { path: layer('telemetry') },
      to: { path: '^src/', pathNot: anyOf('core', 'sim', 'telemetry') },
    },
    {
      name: 'platform-only-core',
      severity: 'error',
      from: { path: layer('platform') },
      to: { path: '^src/', pathNot: anyOf('core', 'platform') },
    },
    {
      name: 'sim-is-types-only-outside-sim',
      comment: 'render, content, audio and telemetry may import sim types, never sim runtime code.',
      severity: 'error',
      from: { path: anyOf('render', 'content', 'audio', 'telemetry') },
      to: { path: layer('sim'), dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'tools-only-from-app-or-tools',
      comment: 'tools are dev-only and stripped from release builds.',
      severity: 'error',
      from: { pathNot: anyOf('app', 'tools') },
      to: { path: layer('tools') },
    },
    {
      name: 'nothing-imports-app',
      severity: 'error',
      from: { pathNot: layer('app') },
      to: { path: layer('app') },
    },
    {
      name: 'phaser-only-in-render-app-tools',
      severity: 'error',
      from: {
        path: anyOf('core', 'physics', 'sim', 'content', 'input', 'audio', 'telemetry', 'platform'),
      },
      to: { path: 'node_modules/phaser' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
