# Guchho Test

A small, fast, and deterministic testing framework for JavaScript and TypeScript
projects. Guchho Test provides a familiar `describe`/`it`/`expect` API, isolated
test execution, TypeScript and JSX transformation, snapshots, mocking, coverage,
watch mode, and a command-line runner designed for predictable results.

## Features

- Test registration with `describe`, `suite`, `it`, and `test`.
- Focused, skipped, and todo tests with `only`, `skip`, and `todo`.
- Synchronous and asynchronous tests with per-test timeouts.
- Assertions with `expect`, `.not`, `.resolves`, `.rejects`, and custom matchers.
- Lifecycle hooks with deterministic ordering across nested suites.
- Mock functions, spies, constructor mocks, and ESM module mocking.
- External and inline snapshots with update mode.
- TypeScript and JSX test files with inline source maps.
- V8 coverage with text, HTML, and JSON reports plus thresholds.
- Built-in `default`, `verbose`, `dot`, `json`, and `junit` reporters.
- Plugin-provided reporters.
- Parallel file execution using worker threads or child processes.
- Watch mode that reruns only the test files affected by a change.
- Configuration discovery with validation and CLI-over-config precedence.

## Requirements

- Node.js `>=20.19.0`
- npm
- An ESM project (`"type": "module"`) or ESM test files such as `.mjs` and `.mts`

## Installation

Install Guchho Test as a development dependency:

```bash
npm install --save-dev @guchho/test
```

Verify the command-line interface:

```bash
npx guchho-test --version
npx guchho-test --help
```

Add a test script to `package.json`:

```json
{
  "scripts": {
    "test": "guchho-test run"
  }
}
```

Then run the suite with:

```bash
npm test
```

## Quick start

Create `src/math.test.js`:

```js
import { describe, it, expect } from '@guchho/test';

describe('math', () => {
  it('adds numbers', () => {
    expect(1 + 1).toBe(2);
  });

  it('handles async work', async () => {
    const value = await Promise.resolve(20);
    expect(value).toBeGreaterThan(10);
  });
});
```

Run all discovered tests:

```bash
npx guchho-test
```

The default command is `run`, so this is equivalent to:

```bash
npx guchho-test run
```

Run a specific file:

```bash
npx guchho-test run src/math.test.js
```

By default, Guchho Test discovers files matching:

```text
**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}
```

and ignores `node_modules`, `dist`, and `.git`. Override these patterns in a
configuration file.

## Writing tests

Import the test API directly. Global functions are not required.

```js
import { describe, it, expect } from '@guchho/test';

describe('calculator', () => {
  it('adds', () => {
    expect(2 + 2).toBe(4);
  });
});
```

`suite` is an alias for `describe`, and `test` is an alias for `it`.

### Nested suites

Suites can be nested. Full test names are joined with ` > `.

```js
import { describe, it, expect } from '@guchho/test';

describe('user', () => {
  describe('validation', () => {
    it('rejects empty names', () => {
      expect(validateName('')).toBe(false);
    });
  });
});
```

### Asynchronous tests

Return a promise from the test callback and the runner will await it.

```js
import { it, expect } from '@guchho/test';

it('loads a user', async () => {
  const user = await loadUser(1);
  expect(user.id).toBe(1);
});
```

A rejected promise fails the test.

### Timeouts

The default timeout is `5000` ms. Set a test-specific timeout with the third
argument:

```js
it('is slow', async () => {
  await delay(1000);
}, 10000);
```

Override the default for the whole run:

```bash
guchho-test run --timeout=10000
```

### Skipped, focused, and todo tests

```js
it.skip('not ready', () => {});

it.only('focused', () => {
  // Runs when any `only` test exists.
});

it.todo('write this later');
```

When any `only` test exists, tests that are not focused directly or through an
ancestor suite are reported as skipped.

## Assertions

Import `expect` from `@guchho/test`. A failed assertion throws an
`AssertionError` and marks the test as failed.

```js
import { describe, it, expect } from '@guchho/test';

describe('assertions', () => {
  it('supports common matchers', () => {
    expect(2 + 2).toBe(4);
    expect({ id: 1 }).toEqual({ id: 1 });
    expect({ id: 1 }).toStrictEqual({ id: 1 });
    expect('hello').toContain('ell');
    expect([1, 2, 3]).toContain(2);
    expect('hello world').toMatch(/^hello/);
    expect([1, 2]).toHaveLength(2);
    expect(10).toBeGreaterThan(5);
    expect(null).toBeNull();
    expect(undefined).toBeUndefined();
  });
});
```

### Negation

Use `.not` to invert a matcher:

```js
expect(1).not.toBe(2);
expect([1, 2]).not.toContain(3);
```

### Async assertions

Use `.resolves` or `.rejects` and await the assertion:

```js
await expect(Promise.resolve(42)).resolves.toBe(42);

await expect(Promise.reject(new Error('nope'))).rejects.toThrow('nope');
```

### Error assertions

```js
expect(() => {
  throw new TypeError('bad type');
}).toThrow(TypeError);

expect(() => {
  throw new Error('boom');
}).toThrow('boom');
```

### Custom matchers

Register custom matchers with `expect.extend`:

```js
expect.extend({
  toBeEven(received) {
    return {
      pass: typeof received === 'number' && received % 2 === 0,
      message: () => `Expected ${this.utils.printReceived(received)} to be even.`,
    };
  },
});

expect(4).toBeEven();
expect(3).not.toBeEven();
```

See [Assertions](./docs/assertions.md) for the full matcher list, custom equality
tests, and assertion diagnostics.

## Lifecycle hooks

```js
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from '@guchho/test';

describe('database', () => {
  let db;

  beforeAll(async () => {
    db = await openDatabase();
  });

  beforeEach(async () => {
    await db.seed();
  });

  afterEach(async () => {
    await db.clear();
  });

  afterAll(async () => {
    await db.close();
  });

  it('reads rows', async () => {
    expect(await db.rows()).toHaveLength(1);
  });
});
```

Hooks apply to the current suite and all of its tests. `beforeAll` and
`beforeEach` run in registration order; `afterEach` and `afterAll` run in reverse
order. `afterEach` and `afterAll` still run after test or hook failures.

A failing `beforeAll` causes the suite's tests to be reported as skipped. A
failing `beforeEach` fails the test it wraps, but `afterEach` still runs.

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
with source maps. Values are serialized deterministically with sorted object
keys, so snapshots are stable across runs.

Create missing snapshots and update changed ones with:

```bash
guchho-test run --update
```

or:

```bash
guchho-test run -u
```

## Mocks

```js
import { describe, it, expect, mock } from '@guchho/test';

describe('mocks', () => {
  it('tracks calls and arguments', () => {
    const callback = mock.fn();
    callback('hello');

    expect(callback).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('hello');
  });
});
```

Provide an implementation:

```js
const add = mock.fn((a, b) => a + b);
expect(add(2, 3)).toBe(5);
```

Configure return values and one-time behavior:

```js
const fn = mock.fn();

fn.mockReturnValue(100);
fn.mockReturnValueOnce(200);
fn.mockResolvedValue({ ok: true });
fn.mockRejectedValue(new Error('failed'));
fn.mockImplementation(() => 'mocked');
```

`mock.fn()` records calls, return values, thrown errors, constructed instances,
and invocation order.

### Spies

Use `mock.spyOn(object, 'method')` to wrap an existing function while preserving
its original behavior:

```js
const logger = {
  log(message) {
    return `logged: ${message}`;
  },
};

const spy = mock.spyOn(logger, 'log');
logger.log('hi');

expect(spy).toHaveBeenCalledWith('hi');

spy.mockRestore();
```

Spying requires a configurable data property containing a function. Accessors
and non-configurable properties are rejected.

### Resetting mocks

```js
const fn = mock.fn(() => 1);

fn();
fn.mockClear(); // Clears calls but keeps the implementation.

fn.mockReset(); // Clears calls and restores the original implementation.
```

`mock.clearAll()`, `mock.resetAll()`, and `mock.restoreAll()` apply the same
operations to all registered mocks.

## Module mocking

```js
import { mock } from '@guchho/test';

mock.module('./api.js', () => ({
  getUser: () => ({ id: 1, name: 'Test User' }),
}));

const api = await import('./api.js');
const user = api.getUser();
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

Guchho Test discovers the nearest configuration file automatically. In
precedence order within a directory, the supported names are:

```text
guchho.test.config.ts
guchho.test.config.js
guchho.test.config.mjs
guchho.test.config.json
```

### TypeScript configuration

Create `guchho.test.config.ts` in the project root:

```ts
import { defineConfig } from '@guchho/test';

export default defineConfig({
  include: ['**/*.{test,spec}.{js,ts}'],
  exclude: ['**/node_modules/**', '**/dist/**'],
  timeout: 5000,
  reporters: ['default'],
});
```

### JavaScript configuration

```js
import { defineConfig } from '@guchho/test';

export default defineConfig({
  include: ['src/**/*.test.js'],
  timeout: 10000,
  reporters: ['verbose'],
});
```

### JSON configuration

```json
{
  "include": ["src/**/*.test.js"],
  "timeout": 10000,
  "reporters": ["default"]
}
```

The CLI discovers the nearest configuration file automatically. Use
`--config <path>` to select a specific file. Configuration is validated with
clear error messages, and CLI options such as `--timeout` take precedence over
configuration values.

See [Configuration](./docs/configuration.md) for the complete schema.

## TypeScript and JSX

Test files may use `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.jsx`, and
`.tsx`. TypeScript and JSX are transformed through Node.js loader hooks with
inline source maps, so stack traces point to the original source lines.

```ts
import { describe, it, expect } from '@guchho/test';

interface User {
  id: number;
  name: string;
}

describe('users', () => {
  it('creates a typed user', () => {
    const user: User = { id: 1, name: 'Ada' };
    expect(user.name).toBe('Ada');
  });
});
```

`.cts` files are transformed as CommonJS; all other transformed files use ESM.
JSX uses the classic runtime, so a `React.createElement` implementation must be
available in the module scope (or provided through a JSX factory of your choice).

See [TypeScript and JSX](./docs/typescript.md) for configuration details.

## Command line

```bash
guchho-test                               # discover and run once
guchho-test run src/math.test.ts          # run specific files
guchho-test watch                         # rerun affected tests on change
guchho-test run --filter math             # substring filter on full test names
guchho-test run --testNamePattern=^math   # regular expression filter
guchho-test run --bail                    # stop after the first failure
guchho-test run --maxWorkers=4            # run files in parallel
guchho-test run --pool=forks              # use child processes instead of threads
guchho-test run --reporter=json           # machine-readable output
guchho-test run --reporter=junit          # JUnit XML output
guchho-test run --coverage                # collect V8 coverage
guchho-test run --update                  # create or update snapshots
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | All selected tests passed. |
| `1` | At least one test failed, or a coverage threshold was not met. |
| `2` | CLI, configuration, discovery, or execution error. |

### Filtering tests

Filter by a substring of the full test name:

```bash
guchho-test run --filter validation
```

Filter with a regular expression:

```bash
guchho-test run --testNamePattern "^user > validation"
```

Filtered-out tests are not reported.

## Watch mode

```bash
guchho-test watch
```

Watch mode monitors the project recursively, tracks local dependencies using the
TypeScript parser, and reruns only test files affected by a change. Rapid changes
are debounced and coalesced, added test files are discovered automatically, and
unrelated files do not trigger runs. Press Ctrl+C to stop watching.

## Parallel execution

Test files are executed in isolated worker threads by default. Use
`--maxWorkers` to run multiple files concurrently:

```bash
guchho-test run --maxWorkers=4
```

Use child processes instead of worker threads:

```bash
guchho-test run --pool=forks
```

Results are always reported in deterministic file order, even when files finish
out of order. Worker crashes are reported as execution errors and produce exit
code `2`.

## Reporters

The built-in reporters are `default`, `verbose`, `dot`, `json`, and `junit`.
Select one with `--reporter` or the `reporters` configuration option:

```bash
guchho-test run --reporter=verbose
```

```ts
import { defineConfig } from '@guchho/test';

export default defineConfig({
  reporters: ['verbose'],
});
```

The JSON reporter writes a single JSON document to stdout containing the run
summary and every file and test result, including stack traces for failures. The
JUnit reporter writes XML with one `<testsuite>` per test file, including
failures, skipped/todo tests, and hook errors.

See [Reporters](./docs/reporters.md) for the full reporter reference.

## Coverage

```bash
guchho-test run --coverage
```

Coverage uses the V8 inspector and maps results back through TypeScript source
maps. Reports include lines, functions, branches, and statements. The text report
is written to stdout, while configured HTML and JSON reports are written below
`coverage/`.

```ts
import { defineConfig } from '@guchho/test';

export default defineConfig({
  coverage: {
    enabled: true,
    reporter: ['text', 'html', 'json'],
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts'],
    reportsDirectory: 'coverage',
    thresholds: {
      lines: 90,
      functions: 85,
      branches: 80,
      statements: 90,
    },
  },
});
```

Coverage threshold failures produce exit code `1`. Coverage configuration or
collection errors produce exit code `2`.

See [Coverage](./docs/coverage.md) for the full coverage reference.

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
import { defineConfig } from '@guchho/test';

export default defineConfig({
  plugins: ['./guchho-plugin.js'],
  reporters: [['summary', { label: 'Tests' }]],
});
```

Plugin paths are resolved from the working directory. Reporter options come from
the `[name, options]` configuration tuple and custom reporters receive
`ReporterIO` for writing output.

## Project structure

A typical project using Guchho Test might look like this:

```text
my-project/
├── src/
│   ├── math.js
│   └── math.test.js
├── guchho.test.config.ts
├── package.json
└── __snapshots__/
    └── math.test.js.snap
```

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

## License

MIT
