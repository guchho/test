---
title: Guchho Test Documentation
description: Overview of the Guchho Test framework, its features, and documentation contents.
---

# Guchho Test Documentation

Guchho Test (`@guchho/test`) is a lightweight JavaScript and TypeScript testing
framework for the Guchho ecosystem. It provides a familiar suite/test API, a
built-in assertion engine, lifecycle hooks, mocks and spies, module mocking,
snapshots, coverage, reporters, watch mode, and parallel execution.

## Contents

1. [Introduction](./introduction.md)
2. [Installation](./installation.md)
3. [Quick Start](./quick-start.md)
4. [Writing Tests](./writing-tests.md)
5. [Assertions](./assertions.md)
6. [Lifecycle Hooks](./lifecycle-hooks.md)
7. [Mocking](./mocking.md)
8. [Snapshot Testing](./snapshot-testing.md)
9. [Configuration](./configuration.md)
10. [CLI Reference](./cli.md)
11. [Watch Mode](./watch-mode.md)
12. [Coverage](./coverage.md)
13. [Reporters](./reporters.md)
14. [TypeScript and JSX](./typescript.md)
15. [API Reference](./api.md)
16. [Troubleshooting](./troubleshooting.md)
17. [Contributing](./contributing.md)

## At a glance

```js
import { describe, it, expect } from '@guchho/test';

describe('math', () => {
  it('adds numbers', () => {
    expect(1 + 1).toBe(2);
  });
});
```

```bash
npx guchho-test
```

Every document in this directory describes implemented behavior. If a feature is
not covered here, treat it as unsupported rather than assumed.
