import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GMR-99 guard: the slim Phaser build (vendor/phaser-custom.js) keeps only what the game uses, but
 * TypeScript types still describe the full engine, so code can type-check against a system that is
 * undefined at runtime. This test lists every `Phaser.X(.Y)` path used in src/ and requires each
 * one to be provided by the slim entry, so the mistake fails here instead of in a player's browser.
 */

const entry = readFileSync('vendor/phaser-custom.js', 'utf8');

/** What the slim entry exposes: top-level exports, plus the members of the object namespaces. */
function provided(): Set<string> {
  const out = new Set<string>();
  for (const m of entry.matchAll(/export const (\w+) =/g)) out.add(m[1] as string);
  for (const m of entry.matchAll(/export \{([^}]+)\}/g)) {
    for (const name of (m[1] as string).split(',')) out.add(name.trim());
  }
  for (const m of entry.matchAll(/export const (\w+) = \{([^}]+)\}/g)) {
    for (const member of (m[2] as string).split(',')) out.add(`${m[1] as string}.${member.trim()}`);
  }
  return out;
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

describe('slim Phaser build guard (GMR-99)', () => {
  it('every Phaser namespace path used in src/ exists in vendor/phaser-custom.js', () => {
    const have = provided();
    const missing = new Set<string>();
    for (const file of sources('src')) {
      for (const m of readFileSync(file, 'utf8').matchAll(
        /\bPhaser\.([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?/g,
      )) {
        const root = m[1] as string;
        const leaf = m[2];
        // Namespaces kept as objects must provide the member too (e.g. GameObjects.Graphics).
        const objectNamespace = new RegExp(`export const ${root} = \\{`).test(entry);
        const path = objectNamespace && leaf ? `${root}.${leaf}` : root;
        if (!have.has(path)) missing.add(`${path} (${file})`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
