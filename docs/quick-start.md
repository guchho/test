---
title: Quick Start
description: Write a first test file, add a config, and run the test suite.
date: "2026-11-02"
---

# Quick Start

This walkthrough creates a minimal ESM project, adds one test file, and runs it
with the default reporter. It takes a few minutes and requires no configuration.

```text
my-project/
├── package.json
└── src/
    └── math.test.js
```

| File | Purpose |
| --- | --- |
| `package.json` | Declares ESM (`"type": "module"`) and the test scripts. |
| `src/math.test.js` | The first test file, discovered by the default patterns. |

## 1. Write a test file

Create `src/math.test.js`:

```js
import { describe, it, expect } from '@guchho/test';

describe('math', () => {
  it('adds numbers', () => {
    expect(1 + 1).toBe(2);
  });

  it('subtracts numbers', () => {
    expect(10 - 3).toBe(7);
  });

  it('handles async work', async () => {
    const value = await Promise.resolve(20);
    expect(value).toBeGreaterThan(10);
  });
});
```

## 2. Run the tests

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

| Command | What it does |
| --- | --- |
| `npx guchho-test` | Discover and run every matching test file. |
| `npx guchho-test run src/math.test.js` | Run one file. |
| `npx guchho-test run --filter math` | Run tests whose full name contains `math`. |
| `npx guchho-test watch` | Rerun affected tests when files change. |
| `npx guchho-test run --coverage` | Collect V8 coverage. |
| `npx guchho-test run --reporter=junit` | Produce JUnit XML for CI. |
| `npx guchho-test run --update` | Create or update snapshots. |

## 3. Understand the output

The default reporter prints each file, each test result, and a summary with
pass/fail/skip/todo counts and durations.

Exit codes:

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| `0`  | All selected tests passed                                     |
| `1`  | One or more tests failed, or a coverage threshold was not met |
| `2`  | Configuration, CLI, discovery, or execution error             |

## 4. Add configuration (optional)

Create `guchho.test.config.js` in the project root:

```js
import { defineConfig } from '@guchho/test';

export default defineConfig({
  include: ['src/**/*.test.js'],
  timeout: 5000,
  reporters: ['default'],
});
```

See [Configuration](./configuration.md) for the full schema.

## What you just built

You now have a discovered test file, a working CLI invocation, and an optional
configuration file. From here, add assertions, lifecycle hooks, mocks, and
snapshots as your test suite grows.

## More examples

**Lifecycle hooks**

```js
import { describe, it, expect, beforeEach } from '@guchho/test';

describe('counter', () => {
  let count;

  beforeEach(() => {
    count = 0;
  });

  it('starts at zero', () => {
    expect(count).toBe(0);
  });
});
```

**Mocks**

```js
import { it, expect, mock } from '@guchho/test';

it('calls the logger', () => {
  const log = mock.fn();

  log('ready');

  expect(log).toHaveBeenCalledWith('ready');
  expect(log).toHaveBeenCalledTimes(1);
});
```

**Snapshots**

```js
import { it, expect } from '@guchho/test';

it('matches the expected shape', () => {
  expect({ name: 'guchho', stable: true }).toMatchSnapshot();
});
```

## 5. Explore more

- [Assertions](./assertions.md)
- [Lifecycle Hooks](./lifecycle-hooks.md)
- [Mocking](./mocking.md)
- [Snapshots](./snapshot-testing.md)
- [CLI Reference](./cli.md)
