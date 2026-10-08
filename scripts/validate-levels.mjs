import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

// Middleware mode creates no listening port and closes the watcher even on validation failure.
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
});
let failures = 0;
let warnings = 0;
try {
  const { validateLevelSchema } = await server.ssrLoadModule('/src/content/level.ts');
  const { validateLevelAuthoring } = await server.ssrLoadModule('/src/content/validate-level.ts');
  const directory = resolve('content/levels');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  const ids = new Set();
  const telemetryIds = new Set();
  for (const file of files) {
    try {
      const json = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
      validateLevelSchema(json);
      if (ids.has(json.id)) throw new Error(`level.id: duplicate registry id "${json.id}"`);
      ids.add(json.id);
      const telemetryId = json.telemetry?.levelId ?? json.id;
      if (telemetryIds.has(telemetryId))
        throw new Error(`level.telemetry.levelId: duplicate telemetry id "${telemetryId}"`);
      telemetryIds.add(telemetryId);
      for (const issue of validateLevelAuthoring(json)) {
        if (issue.severity === 'error') failures++;
        else warnings++;
        console[issue.severity === 'error' ? 'error' : 'warn'](
          `${file}: ${issue.severity}: ${issue.path}: ${issue.message}`,
        );
      }
    } catch (error) {
      failures++;
      console.error(`${file}: error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`Validated ${files.length} levels: ${failures} errors, ${warnings} warnings.`);
} finally {
  await server.close();
}
process.exitCode = failures === 0 ? 0 : 1;
