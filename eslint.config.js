import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'test-results', 'playwright-report', 'native', 'desktop'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.cjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Determinism rules for the simulation (doc 30 §5): fixed step, tick counts and seeded RNG only.
    files: ['src/sim/**/*.ts', 'src/core/**/*.ts', 'src/physics/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG from core.' },
        { object: 'Date', property: 'now', message: 'Use simulation ticks, not wall-clock time.' },
        {
          object: 'performance',
          property: 'now',
          message: 'Use simulation ticks, not wall-clock time.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Use simulation ticks, not wall-clock time.',
        },
      ],
    },
  },
);
