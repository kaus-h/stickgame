# StickGame — Precision Tether Platformer

A cross-platform momentum-action precision platformer where every rope shot defines your swing geometry. Move, jump, shoot the rope: the distance to the impact point at the moment it connects becomes your swing radius.

Targets: web, iOS and Android (Capacitor), Steam (Electron), all from one simulation. Stack: TypeScript, Phaser 4, Vite (see ADR-001 in Linear).

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Script              | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server                                                      |
| `npm run build`     | Production build into `dist/`                                        |
| `npm run typecheck` | TypeScript, no emit                                                  |
| `npm run lint`      | ESLint plus architecture layer rules                                 |
| `npm run test`      | Unit tests (Vitest)                                                  |
| `npm run test:e2e`  | Browser smoke tests (Playwright; run `npx playwright install` first) |
| `npm run check`     | Typecheck, lint, format check, tests and build                       |

## Where things are

- Planning and canon: Linear project **Precision Tether Platformer** (team GameDev, `GMR`).
- Rules for agents and contributors: [AGENTS.md](AGENTS.md).
- Code layout: `src/{core,physics,sim,content,input,render,audio,telemetry,platform,tools,app}` (doc 30).
- Content: `content/` (levels, tuning, audio parameters, strings). Assets: `assets/` with a provenance register. Art prompts: `prompts/`.
