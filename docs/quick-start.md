# Quick Start

## 1. Write a test file

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

## 3. Understand the output

The default reporter prints each file, each test result, and a summary with
pass/fail/skip/todo counts and durations.

Exit codes:

| Code | Meaning |
|---|---|
| `0` | All selected tests passed |
| `1` | One or more tests failed, or a coverage threshold was not met |
| `2` | Configuration, CLI, discovery, or execution error |

## 4. Add configuration (optional)

Create `guchho-test.config.js` in the project root:

```js
import { defineConfig } from '@guchho/test';

export default defineConfig({
  include: ['src/**/*.test.js'],
  timeout: 5000,
  reporters: ['default'],
});
```

See [Configuration](./configuration.md) for the full schema.

## 5. Explore more

- [Assertions](./assertions.md)
- [Lifecycle Hooks](./lifecycle-hooks.md)
- [Mocking](./mocking.md)
- [Snapshots](./snapshot-testing.md)
- [CLI Reference](./cli.md)
