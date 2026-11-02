---
title: Guchho Test Documentation
description: Fast, ESM-first JavaScript and TypeScript testing framework for the Guchho ecosystem.
date: "2026-11-02"
---

# Guchho Test Documentation

**Guchho Test** (`@guchho/test`) is a lightweight, ESM-first testing framework
designed for JavaScript and TypeScript projects. It delivers a familiar
`describe`/`it` API, a powerful assertion engine, lifecycle hooks, mocks and
spies, ESM module mocking, snapshots, coverage reporting, and first-class CLI
support — all with minimal dependencies and predictable behavior.

Built for both standalone use and integration with the [Guchho](https://guchho.js.org)
build toolchain, Guchho Test runs each test file in isolation, produces
deterministic output, and ships with actionable diagnostics.

## Start here

- [Introduction](./introduction.md) — What Guchho Test is and how it works
- [Installation](./installation.md) — Install the package and add scripts
- [Quick Start](./quick-start.md) — Write and run your first test in minutes
- [Writing Tests](./writing-tests.md) — Structure suites, use modifiers, and write async tests

## Contents

### Core Concepts

| Page | What it covers |
| --- | --- |
| [Introduction](./introduction.md) | Philosophy, features, and design principles |
| [Installation](./installation.md) | Requirements, setup, and verification |
| [Quick Start](./quick-start.md) | Minimal example from scratch |
| [Writing Tests](./writing-tests.md) | Test registration, table-driven tests, timeouts, and isolation |
| [Lifecycle Hooks](./lifecycle-hooks.md) | `beforeAll`, `beforeEach`, `afterEach`, `afterAll` and ordering |
| [TypeScript and JSX](./typescript.md) | TS/TSX/JSX support, transformation, and source maps |

### Assertions & Mocking

| Page | What it covers |
| --- | --- |
| [Assertions](./assertions.md) | `expect` API, matchers, async assertions, polling, and custom matchers |
| [Mocking](./mocking.md) | Mock functions, spies, constructors, fake timers, and ESM module mocking |
| [Snapshot Testing](./snapshot-testing.md) | External and inline snapshots, updates, and serialization |

### Configuration & Execution

| Page | What it covers |
| --- | --- |
| [Configuration](./configuration.md) | Config discovery, options, defaults, validation, and precedence |
| [CLI Reference](./cli.md) | Commands, flags, filters, sharding, and exit codes |
| [Watch Mode](./watch-mode.md) | File watching, dependency tracking, and interactive filtering |

### Reporting & Quality

| Page | What it covers |
| --- | --- |
| [Coverage](./coverage.md) | V8 coverage, source maps, reporters, thresholds, and CI integration |
| [Reporters](./reporters.md) | Built-in reporters, plugin reporters, and the reporter API |

### Advanced

| Page | What it covers |
| --- | --- |
| [API Reference](./api.md) | All exports, types, `runTests()`, and plugin APIs |
| [Troubleshooting](./troubleshooting.md) | Common issues, debugging tips, and solutions |
| [Contributing](./contributing.md) | Development setup, coding style, and release process |

## At a glance

```js
import { describe, it, expect } from '@guchho/test';

describe('Calculator', () => {
  it('adds two numbers', () => {
    expect(1 + 2).toBe(3);
  });

  it('handles async operations', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
```

```bash
# Run all tests
npx guchho-test

# Watch mode for development
npx guchho-test watch

# With coverage
npx guchho-test run --coverage
```

## Features

| Feature | Description |
| --- | --- |
| **Familiar API** | Drop-in style `describe`, `it`, `test`, with `only`, `skip`, and `todo` |
| **ESM-first** | Native ESM support with loader hooks for module mocking |
| **TypeScript ready** | Zero-config TypeScript and JSX/TSX transformation with inline source maps |
| **Isolated execution** | Each test file runs in its own worker for true isolation |
| **Powerful mocking** | Functions, spies, constructors, timers, and full ESM module replacement |
| **Snapshot testing** | External and inline snapshots with property matchers and diff output |
| **Built-in coverage** | V8 coverage with per-file and global thresholds, multiple report formats |
| **Watch mode** | Intelligent reruns based on dependency tracking with interactive filtering |
| **Deterministic output** | Stable ordering for reliable CI results |
| **Extensible** | Plugin system for custom reporters and matchers |

## Requirements

- **Node.js:** `>=20.19.0`
- **Module system:** ESM (`"type": "module"`) or ESM file extensions (`.mjs`, `.mts`)

## Getting help

- [Troubleshooting](./troubleshooting.md) — Solutions for common issues
- [GitHub Issues](https://github.com/guchho/test/issues) — Report bugs or request features
- [GitHub Discussions](https://github.com/guchho/test/discussions) — Ask questions and share ideas

---

Every document in this directory describes implemented behavior. If a feature is
not covered here, treat it as unsupported rather than assumed.
