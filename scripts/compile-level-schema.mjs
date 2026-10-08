import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { format, resolveConfig } from 'prettier';

const schemaFile = new URL('../content/level.schema.json', import.meta.url);
const generatedFile = new URL('../src/content/level-validator.generated.js', import.meta.url);
const schema = JSON.parse(await readFile(schemaFile, 'utf8'));

// For an empty/nonempty test, UTF-16 length and Unicode code-point length are equivalent.
// Guard that premise so future schema changes cannot silently weaken string validation.
function guardStringLengths(value) {
  if (value === null || typeof value !== 'object') return;
  if ('maxLength' in value || ('minLength' in value && value.minLength !== 1)) {
    throw new Error(
      'Standalone schema optimization requires minLength: 1 only and no maxLength. Add a Unicode length helper before changing that contract.',
    );
  }
  for (const child of Object.values(value)) guardStringLengths(child);
}
guardStringLengths(schema);

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  strictNumbers: true,
  unicode: false,
  inlineRefs: false,
  logger: false,
  code: { source: true, esm: true },
});
const validator = ajv.compile(schema);
const standalone = standaloneCode(ajv, validator);
if (/\brequire\s*\(|\bimport\s/.test(standalone)) {
  throw new Error('Level validator must remain standalone: unexpected runtime dependency.');
}
const header =
  '// Generated from content/level.schema.json by npm run levels:compile-schema. Do not edit.\n';
const config = await resolveConfig(fileURLToPath(generatedFile));
const output = await format(header + standalone, {
  ...config,
  filepath: fileURLToPath(generatedFile),
});

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = await readFile(generatedFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current.replaceAll('\r\n', '\n') !== output.replaceAll('\r\n', '\n')) {
    console.error(
      'Level schema validator is stale. Run npm run levels:compile-schema and commit its output.',
    );
    process.exitCode = 1;
  } else {
    console.log('Standalone level schema validator matches the JSON Schema.');
  }
} else {
  await writeFile(generatedFile, output);
  console.log('Generated standalone level schema validator.');
}
