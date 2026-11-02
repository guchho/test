---
title: Introduction
description: What Guchho Test is, and the features it provides for JavaScript and TypeScript projects.
date: "2026-11-02"
---

# Introduction

Guchho Test is a testing framework for JavaScript and TypeScript projects. It is
designed to be small, fast, and predictable, with a developer experience similar
to modern test runners while remaining an independent implementation.

## What it includes

| Area | What you get |
| --- | --- |
| Test registration | `describe`, `suite`, `it`, `test`, plus `skip`, `only`, `todo`, `fails`, `concurrent`, `each`, `retry`, `runIf`, and `skipIf`. |
| Assertions | `expect` with sync matchers, `not`, `resolves`, `rejects`, soft assertions, polling, custom matchers, and custom equality tests. |
| Lifecycle hooks | `beforeAll`, `beforeEach`, `afterEach`, `afterAll`, with nested suite ordering and hook error reporting. |
| Mocking | `mock.fn()`, `mock.spyOn()`, constructor mocks, fake timers, implementations, one-time values, resolved/rejected values, and restore helpers. |
| Module mocking | ESM module replacement through Node.js loader hooks. |
| Snapshots | External snapshot files and inline snapshots, property matchers, deterministic serialization, and `--update`. |
| TypeScript and JSX | `.ts`, `.mts`, `.cts`, `.tsx`, and `.jsx` test files with inline source maps and path aliases. |
| CLI | Discovery, filtering, bail, workers, pools, sharding, coverage, reporters, watch mode, and stable exit codes. |
| Configuration | `guchho.test.config.{ts,js,mjs,json}` with validation and CLI-over-config precedence. |
| Coverage | V8 coverage with source-map mapping, text/HTML/JSON/LCOV/Cobertura reports, and global or per-file thresholds. |
| Reporters | Built-in `default`, `verbose`, `dot`, `json`, `junit`, `tap`, and GitHub Actions annotations, plus custom reporters. |

## A first test

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

`describe` groups related tests and `it` registers one behavior. `expect`
returns a matcher object; `toBe` compares primitives while `toEqual` compares
structures.

## How it fits together

| Part | Purpose | Entry point |
| --- | --- | --- |
| Runtime API | Registration, assertions, mocks, snapshots | `@guchho/test` |
| Configuration | Typed config helpers and defaults | `@guchho/test/config` |
| CLI | Discovery, execution, reporting, watch | `guchho-test` |
| Programmatic API | Embed the runner in another tool | `runTests` |

## When to use Guchho Test

Choose Guchho Test when you want a small ESM-first runner with no mandatory
configuration and a familiar suite/test API. It fits projects that already use
Guchho, and it also works as a standalone runner for Node.js libraries and
applications.

The framework is intentionally focused. It covers registration, assertions,
hooks, mocks, snapshots, coverage, reporters, watch mode, and parallel file
execution; it does not try to replace a browser automation framework or a
full-featured build system.

## Requirements

- Node.js `>=20.19.0`
- npm for installation
- ESM packages (the package itself is ESM and exposes an ESM export map)

## Package identity

| Field         | Value          |
| ------------- | -------------- |
| npm package   | `@guchho/test` |
| CLI binary    | `guchho-test`  |
| Module format | ESM            |
| License       | MIT            |

## Design principles

- Deterministic execution and deterministic report ordering.
- Isolated test files: each file runs in its own worker.
- Low dependency count: the runtime uses Node.js built-ins and the TypeScript
  compiler for transformation.
- Actionable diagnostics: assertion errors include expected and received values,
  and configuration errors name the offending option.

## Related

- [Installation](./installation.md)
- [Quick Start](./quick-start.md)
- [Writing Tests](./writing-tests.md)
- [API Reference](./api.md)
