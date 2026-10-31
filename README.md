

## Usage

```js
import { describe, it, expect } from '@guchho/test';

describe('math', () => {
  it('adds numbers', () => {
    expect(1 + 1).toBe(2);
  });
});
```

## Lifecycle hooks

```js
import { beforeAll, beforeEach, afterEach, afterAll } from '@guchho/test';
```

Hooks apply to the current suite and all of its tests. `beforeAll` and
`beforeEach` run in registration order; `afterEach` and `afterAll` run in reverse
order. `afterEach` and `afterAll` still run after test or hook failures.

## Snapshots

```js
import { expect, it } from '@guchho/test';

it('matches a stored value', () => {
  expect({ id: 1, name: 'Ada' }).toMatchSnapshot();
  expect({ id: 1, name: 'Ada' }).toMatchInlineSnapshot();
});
```

External snapshots are stored in `__snapshots__/<test-file>.snap`. Inline
snapshots are written directly into the test source, including TypeScript files
with source maps. Values are serialized deterministically with sorted object keys,
so snapshots are stable across runs. Run `guchho-test run --update` (or `-u`) to
create missing snapshots and update changed ones.

## Mocks

```js
import { mock, expect } from '@guchho/test';

const callback = mock.fn();
callback('hello');

expect(callback).toHaveBeenCalledWith('hello');
```

`mock.fn()` records calls, return values, thrown errors, constructed instances,
and invocation order. `mock.spyOn(object, 'method')` wraps an existing function
and restores its original descriptor with `mockRestore()` or `mock.restoreAll()`.

## Module mocking

```js
mock.module('./api.js', () => ({
  getUser: () => ({ id: 1, name: 'Test User' }),
}));

const api = await import('./api.js');
```

Module mocks must be registered before the mocked module is imported, so use
dynamic `import()` after `mock.module()`.

Supported scenarios:

- Relative paths, absolute paths, and `file:` URLs.
- Existing ESM files with named exports and an optional default export.
- Mock registration and reset between test files when run through the CLI.

Limitations:

- Bare package specifiers and non-existent files are rejected with a clear error.
- Export names must be valid JavaScript identifiers.
- Factory results are captured at registration time; later mutations of the
  returned object are not reflected by the mocked module.
- `mock.module()` cannot affect static imports that are evaluated before the
  registration runs.
- CommonJS `require()` interception is not provided.

## Configuration

Create `guchho-test.config.ts` (or `.js`, `.mjs`, `.json`) in the project root:

```ts
import { defineConfig } from '@guchho/test';

export default defineConfig({
  include: ['**/*.{test,spec}.{js,ts}'],
  exclude: ['**/node_modules/**', '**/dist/**'],
  timeout: 5000,
  reporters: ['default'],
});
```

The CLI discovers the nearest configuration file automatically. Use
`--config <path>` to select a specific file. Configuration is validated with clear
error messages, and CLI options such as `--timeout` take precedence over
configuration values.

## TypeScript and JSX

Test files may use `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.jsx`, and
`.tsx`. TypeScript and JSX are transformed through Node.js loader hooks with
inline source maps, so stack traces point to the original source lines.

`.cts` files are transformed as CommonJS; all other transformed files use ESM.
JSX uses the classic runtime, so a `React.createElement` implementation must be
available in the module scope (or provided through a JSX factory of your choice).

## Command line

```bash
guchho-test                          # discover and run once
guchho-test run src/math.test.ts     # run specific files
guchho-test watch                    # rerun affected tests on change
guchho-test run --filter math        # substring filter on full test names
guchho-test run --testNamePattern=^math  # regular expression filter
guchho-test run --bail               # stop after the first failure
guchho-test run --maxWorkers=4       # run files in parallel
guchho-test run --pool=forks         # use child processes instead of threads
guchho-test run --reporter=json      # machine-readable output
guchho-test run --reporter=junit     # JUnit XML output
guchho-test run --coverage           # collect V8 coverage
guchho-test run --update             # create or update snapshots
```

## Reporters

The built-in reporters are `default`, `verbose`, `dot`, `json`, and `junit`.
Select one with `--reporter` or the `reporters` configuration option. The JSON
reporter writes a single JSON document to stdout containing the run summary and
every file and test result, including stack traces for failures. The JUnit
reporter writes XML with one `<testsuite>` per test file, including failures,
skipped/todo tests, and hook errors. Custom reporters can be supplied by
plugins.

## Coverage

```bash
guchho-test run --coverage
```

Coverage uses the V8 inspector and maps results back through TypeScript source
maps. Reports include lines, functions, branches, and statements. The text report
is written to stdout, while configured HTML and JSON reports are written below
`coverage/`.

```ts
export default defineConfig({
  coverage: {
    enabled: true,
    reporter: ['text', 'html', 'json'],
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts'],
    reportsDirectory: 'coverage',
    thresholds: { lines: 90, functions: 85, branches: 80, statements: 90 },
  },
});
```

Coverage threshold failures produce exit code `1`. Coverage configuration or
collection errors produce exit code `2`.

## Plugins and custom reporters

Plugins can contribute named reporters. A plugin may export its object as the
default export or as `plugin`.

```js
// guchho-plugin.js
import { definePlugin, defineReporter } from '@guchho/test';

export default definePlugin({
  name: 'example',
  reporters: {
    summary: defineReporter((options, io) => ({
      onRunFinish(report) {
        io.stdout(`${options.label}: ${report.summary.passed} passed\n`);
      },
    })),
  },
});
```

```ts
export default defineConfig({
  plugins: ['./guchho-plugin.js'],
  reporters: [['summary', { label: 'Tests' }]],
});
```

Plugin paths are resolved from the working directory. Reporter options come from
the `[name, options]` configuration tuple and custom reporters receive
`ReporterIO` for writing output.

## Watch mode

Watch mode monitors the project recursively, tracks local dependencies using the
TypeScript parser, and reruns only test files affected by a change. Rapid changes
are debounced and coalesced, added test files are discovered automatically, and
unrelated files do not trigger runs. Press Ctrl+C to stop watching.

## Parallel execution

Test files are executed in isolated worker threads by default; use `--pool=forks`
for child processes. Results are always reported in deterministic file order, even
when files complete out of order. Worker crashes are reported as execution errors
and produce exit code 2.

## Documentation

Full documentation lives in [`docs/`](./docs/README.md), covering:

- [Introduction](./docs/introduction.md) and [Installation](./docs/installation.md)
- [Quick Start](./docs/quick-start.md) and [Writing Tests](./docs/writing-tests.md)
- [Assertions](./docs/assertions.md), [Lifecycle Hooks](./docs/lifecycle-hooks.md),
  and [Mocking](./docs/mocking.md)
- [Snapshot Testing](./docs/snapshot-testing.md) and [Configuration](./docs/configuration.md)
- [CLI Reference](./docs/cli.md), [Watch Mode](./docs/watch-mode.md),
  [Coverage](./docs/coverage.md), and [Reporters](./docs/reporters.md)
- [TypeScript and JSX](./docs/typescript.md) and [API Reference](./docs/api.md)
- [Troubleshooting](./docs/troubleshooting.md) and [Contributing](./docs/contributing.md)
