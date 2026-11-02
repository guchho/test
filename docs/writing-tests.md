# Writing Tests

Guchho Test uses a suite/test registration API. Tests are registered when the
file is loaded and executed afterwards by the runner.

## Basic structure

```js
import { describe, it, expect } from '@guchho/test';

describe('calculator', () => {
  it('adds', () => {
    expect(2 + 2).toBe(4);
  });
});
```

`suite` is an alias for `describe`, and `test` is an alias for `it`.

## Nested suites

Suites can be nested. Full test names are joined with `>`:

```js
describe('user', () => {
  describe('validation', () => {
    it('rejects empty names', () => {
      // full name: "user > validation > rejects empty names"
    });
  });
});
```

## Table-driven tests

`it.each` and `describe.each` generate tests or suites from an array of argument
arrays. Placeholders in the title are replaced per case.

```js
import { describe, it, expect } from '@guchho/test';

it.each([
  [1, 1, 2],
  [2, 3, 5],
  [0, 0, 0],
])('adds %d + %d', (left, right, expected) => {
  expect(left + right).toBe(expected);
});
```

`describe.each` passes the values to the suite callback:

```js
describe.each([
  ['admin', ['read', 'write']],
  ['viewer', ['read']],
])('%s permissions', (role, permissions) => {
  it('exposes the expected permissions', () => {
    expect(getPermissions(role)).toEqual(permissions);
  });
});
```

Supported placeholders:

| Placeholder | Value                   |
| ----------- | ----------------------- |
| `%s`        | String value.           |
| `%d`, `%i`  | Integer value.          |
| `%f`        | Numeric value.          |
| `%j`        | JSON value.             |
| `%o`        | Inspected object value. |
| `%#`        | Zero-based case index.  |
| `%%`        | Literal `%`.            |

A title with more placeholders than a case provides throws a `TypeError`. Object
and tagged-template case forms are not implemented yet; see
[`ROADMAP.md`](../ROADMAP.md).

## Synchronous and asynchronous tests

A test may return a promise. The runner awaits it and applies the per-test
timeout.

```js
it('resolves data', async () => {
  const user = await loadUser(1);
  expect(user.id).toBe(1);
});
```

A rejected promise fails the test.

## Timeouts

The default timeout is `5000` ms. Override it per test with the third argument:

```js
it('is slow', async () => {
  await delay(1000);
}, 10000);
```

Override the default for all tests in a run with `--timeout` or the `timeout`
configuration option. Test-level timeouts take precedence.

## Modifiers

### Skip

```js
it.skip('not ready', () => {});

skip('also skipped', () => {});
```

A skipped test is reported with status `skipped` and is not executed.

### Only

```js
it.only('focused', () => {
  // runs
});

describe.only('focused suite', () => {
  // all tests in this suite are focused
});

only('focused test', () => {});
```

When any `only` exists, tests that are not marked `only` (directly or through an
ancestor suite) are reported as skipped.

### Todo

```js
it.todo('write this later');

todo('also later');
```

A todo test has no callback and is reported with status `todo`.

### Concurrent

```js
it.concurrent('loads a user', async () => {
  await loadUser(1);
});

describe.concurrent('requests', () => {
  it('reads', async () => {
    await request('/read');
  });

  it('writes', async () => {
    await request('/write');
  });
});
```

Tests marked concurrent run in parallel with other concurrent tests in the same
suite. `describe.concurrent` applies to the suite and all nested suites. A
non-concurrent test waits for the current concurrent batch to finish. Lifecycle
hooks run per test (`beforeEach`/`afterEach`) or once per suite
(`beforeAll`/`afterAll`), and results are reported in registration order.

Concurrent tests share the same process, so avoid shared mutable state unless
you synchronize access yourself.

### Run if / skip if

```js
it.runIf(process.platform === 'win32')('Windows only', () => {});
it.skipIf(process.env.CI === 'true')('local only', () => {});
```

`it.runIf(condition)` registers a normal test when the condition is `true` and a
skipped test otherwise. `it.skipIf(condition)` registers a normal test when the
condition is `false`. Both variants support `.each`.

### Retries

Pass `retry` in the options object:

```js
it(
  'flaky request',
  async () => {
    await requestThatSometimesFails();
  },
  { retry: 2 },
);
```

Or use the retry modifier:

```js
it.retry(2)('flaky request', async () => {
  await requestThatSometimesFails();
});
```

A test runs at most `retry + 1` times. Each attempt reruns `beforeEach` and
`afterEach`; `beforeAll` and `afterAll` run once per suite. Retries also apply to
failures from `beforeEach` and to timeouts. Use the options object to set both
values:

```js
it(
  'slow and flaky',
  async () => {
    await requestThatSometimesFails();
  },
  { retry: 2, timeout: 10000 },
);
```

## Filters

Filter by substring of the full test name:

```bash
guchho-test run --filter validation
```

Filter by regular expression:

```bash
guchho-test run --testNamePattern "^user > validation"
```

Filtered-out tests are not reported.

## Test files

Supported extensions: `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.jsx`,
`.tsx`.

Files are discovered using the `include` and `exclude` patterns, then sorted for
deterministic execution. Explicit file arguments bypass discovery patterns but
must exist and be files.

## Isolation

Each test file runs in its own worker (thread by default, or child process with
`--pool=forks`). Module state and globals do not leak between files.

## What happens with no tests

If a test file registers no tests, the CLI prints a warning. If discovery finds
no test files at all, the run exits with code `2`.
