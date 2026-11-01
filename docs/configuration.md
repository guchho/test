# Configuration

Guchho Test discovers a configuration file automatically, or you can pass one
explicitly with `--config`.

## File names

In precedence order within a directory:

```text
guchho.test.config.ts
guchho.test.config.js
guchho.test.config.mjs
guchho.test.config.json
```

The CLI starts in the working directory and walks up parent directories until it
finds a configuration file. The nearest file wins.

## TypeScript configuration

```ts
import { defineConfig } from '@guchho/test';

export default defineConfig({
  include: ['**/*.{test,spec}.{js,ts}'],
  exclude: ['**/node_modules/**', '**/dist/**'],
  timeout: 5000,
  reporters: ['default'],
  setupFiles: ['./tests/setup.js'],
  setupFilesAfterEnv: ['./tests/setup-after-env.js'],
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  coverage: {
    enabled: false,
    reporter: ['text', 'html'],
  },
});
```

`.ts` configuration files are transformed by the built-in loader, so no separate
build step is required.

## JSON configuration

```json
{
  "include": ["src/**/*.test.js"],
  "timeout": 10000,
  "reporters": ["default"]
}
```

## Schema

### Top-level options

| Option | Type | Description |
|---|---|---|
| `include` | `string[]` | Glob patterns for test files. |
| `exclude` | `string[]` | Glob patterns to ignore. |
| `timeout` | `number` | Per-test and per-hook timeout in milliseconds. Must be positive and finite. |
| `reporters` | `ReporterEntry[]` | Reporters to run. |
| `plugins` | `string[]` | Paths to plugin modules, resolved from the working directory. |
| `setupFiles` | `string[]` | Modules to load before `setupFilesAfterEnv` and the test file, resolved from the working directory. |
| `setupFilesAfterEnv` | `string[]` | Modules to load after `setupFiles` and before the test file, resolved from the working directory. |
| `globalSetup` | `string` | Module run once before the test files, resolved from the working directory. |
| `globalTeardown` | `string` | Module run once after the test files, resolved from the working directory. |
| `coverage` | `CoverageConfig` | Coverage options. |

Unknown top-level options are rejected.

### `setupFiles` and `setupFilesAfterEnv`

Setup modules run once per test file, inside that file's worker process. Entries
are resolved from the working directory and may be `.js`, `.mjs`, `.cjs`, or
`.ts` files.

Execution order for each test file:

1. every `setupFiles` entry, in array order;
2. every `setupFilesAfterEnv` entry, in array order;
3. the test file itself.

```js
setupFiles: ['./tests/setup-environment.js'],
setupFilesAfterEnv: ['./tests/setup-matchers.js'];
```

A setup module that throws, or cannot be loaded, aborts that test file and exits
with code `2`. The error identifies the failing setup file.

### `globalSetup` and `globalTeardown`

These run once per test run in the main process, rather than once per test file:

1. `globalSetup` runs before any test file is executed.
2. `globalTeardown` runs after all test files finish, including when a test file
   fails.

```js
// tests/global-setup.js
export default async function setup({ cwd }) {
  await startDatabase(cwd);
}

// tests/global-teardown.js
export async function teardown({ cwd }) {
  await stopDatabase(cwd);
}
```

The module may export a function as `default`, or under the matching hook name
(`setup` or `teardown`). The function receives `{ cwd }` and may be synchronous
or return a promise. A failure in either hook prints its error and exits with
code `2`; a `globalSetup` failure prevents the test files from running.

In watch mode both hooks run again for each rerun.

### `reporters`

A reporter entry is either a built-in name or a `[name, options]` tuple:

```js
reporters: [
  'default',
  ['json', { label: 'CI' }],
];
```

Built-in names: `default`, `verbose`, `dot`, `json`, `junit`.

Custom reporter names are accepted only when `plugins` is non-empty. The
`[name, options]` options object is passed to custom reporter factories.

### `coverage`

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable coverage for runs. |
| `provider` | `'v8'` | `'v8'` | Coverage provider. Only `v8` is supported. |
| `reporter` | `('text' \| 'html' \| 'json')[]` | `['text', 'html']` | Report formats. |
| `include` | `string[]` | all source files | Files to include. |
| `exclude` | `string[]` | dependencies, tests, snapshots, coverage output | Files to exclude. |
| `thresholds` | `object` | none | Minimum percentages: `lines`, `functions`, `branches`, `statements`. |
| `reportsDirectory` | `string` | `'coverage'` | Output directory for HTML/JSON reports. |

Threshold values must be numbers between `0` and `100`.

Default coverage include:

```text
**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}
```

Default coverage exclude:

```text
**/node_modules/**
**/dist/**
**/tests/**
**/*.test.*
**/*.spec.*
**/__snapshots__/**
**/coverage/**
```

## Defaults

| Option | Default |
|---|---|
| `include` | `['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']` |
| `exclude` | `['**/node_modules/**', '**/dist/**', '**/.git/**']` |
| `timeout` | `5000` |
| `reporters` | `['default']` |
| `plugins` | `[]` |
| `setupFiles` | `[]` |
| `setupFilesAfterEnv` | `[]` |
| `globalSetup` | none |
| `globalTeardown` | none |

## Precedence

Command-line options override configuration values, which override defaults.

- `--timeout` overrides `timeout`.
- `--reporter` replaces the configured `reporters` with a single reporter.
- `--coverage` sets `coverage.enabled` to `true`.
- `--config <path>` selects a specific file instead of discovery.

## Validation

Configuration is validated before running. Errors identify the file and option,
for example:

```text
guchho.test.config.js: "timeout" must be a positive, finite number.
guchho.test.config.js: unknown configuration option "foo".
guchho.test.config.js: unknown reporter "mocha".
```

Invalid configuration exits with code `2`.

## Globs

Discovery uses a small glob implementation supporting:

- `*` — any characters except `/`;
- `**` — any characters including `/` (`**/` also matches zero directories);
- `?` — a single non-`/` character;
- `{a,b}` — alternatives.

Patterns are matched against POSIX-style relative paths.
