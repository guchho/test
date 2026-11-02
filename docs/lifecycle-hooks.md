---
title: Lifecycle Hooks
description: Run setup and teardown code around suites and tests with before/after hooks.
date: "2026-11-02"
---

# Lifecycle Hooks

Hooks run around suites and tests. Import them from `@guchho/test`:

```js
import { beforeAll, beforeEach, afterEach, afterAll } from '@guchho/test';
```

Hooks are registered inside a suite and apply to that suite and its descendants.
Use them to create fixtures, reset shared state, and release resources in a
predictable order.

## Scope

Hooks apply to the current suite and every nested suite/test beneath it.

```js
import {
  describe,
  it,
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
    // db is ready and seeded
  });
});
```

## Ordering

For a given suite:

1. `beforeAll` hooks run in registration order.
2. For each test:
   - ancestor `beforeEach` hooks run first, then this suite's `beforeEach` hooks,
     each in registration order;
   - the test runs;
   - this suite's `afterEach` hooks run in reverse registration order, then
     ancestor `afterEach` hooks.
3. `afterAll` hooks run in reverse registration order.

Nested suites run their own `beforeAll`/`afterAll` around their items, while
ancestor `beforeEach`/`afterEach` still wrap nested tests.

## Async hooks

Hooks may return a promise. The runner awaits them and applies the run timeout
(the resolved configuration timeout). A hook that exceeds the timeout fails.

## Failures and cleanup

- A failing `beforeEach` fails the test it wraps. `afterEach` hooks still run.
- A failing `beforeAll` causes the suite's tests to be reported as skipped.
  `afterAll` hooks still run.
- `afterEach` and `afterAll` run after test failures.
- Hook errors are recorded separately and reported by reporters. A hook error
  makes the run unsuccessful.

Example with cleanup:

```js
describe('files', () => {
  let file;

  beforeEach(() => {
    file = createTempFile();
  });

  afterEach(() => {
    // runs even when the test fails
    removeTempFile(file);
  });

  it('fails', () => {
    throw new Error('boom');
  });
});
```

## Best practices

- Keep hooks small and deterministic; they run for every matching test.
- Create expensive resources in `beforeAll` and release them in `afterAll`.
- Reset mutable state in `beforeEach` and `afterEach` so tests stay isolated.
- Return or await promises from async hooks.
- Avoid assertions in cleanup hooks unless the assertion is the point of the
  hook.

## Hook errors in reporters

Reporters receive hook errors through `onHookError(error, display)`. Each error
includes:

| Field   | Description                                            |
| ------- | ------------------------------------------------------ |
| `type`  | `beforeAll`, `afterAll`, `beforeEach`, or `afterEach`. |
| `suite` | Suite full name, or `<root>`.                          |
| `error` | The thrown value.                                      |

## Related

- [Writing Tests](./writing-tests.md)
- [Mocking](./mocking.md)
- [Configuration](./configuration.md)
- [Reporters](./reporters.md)
