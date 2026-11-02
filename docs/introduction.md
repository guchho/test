---
title: Introduction
description: What Guchho Test is, and the features it provides for JavaScript and TypeScript projects.
---

# Introduction

Guchho Test is a testing framework for JavaScript and TypeScript projects. It is
designed to be small, fast, and predictable, with a developer experience similar
to modern test runners while remaining an independent implementation.

## What it includes

- **Test registration:** `describe`, `suite`, `it`, `test`, plus `skip`, `only`,
  and `todo` modifiers.
- **Assertions:** `expect` with sync matchers, `not`, `resolves`, `rejects`,
  custom matchers, and custom equality tests.
- **Lifecycle hooks:** `beforeAll`, `beforeEach`, `afterEach`, `afterAll`, with
  nested suite ordering.
- **Mocking:** `mock.fn()`, `mock.spyOn()`, mock implementations, one-time
  values, resolved/rejected values, and restore helpers.
- **Module mocking:** ESM module replacement through Node.js loader hooks.
- **Snapshots:** external snapshot files and inline snapshots, with deterministic
  serialization and `--update`.
- **TypeScript and JSX:** `.ts`, `.mts`, `.cts`, `.tsx`, and `.jsx` test files
  with inline source maps.
- **CLI:** discovery, filtering, bail, parallel workers, pools, coverage,
  reporters, watch mode, and stable exit codes.
- **Configuration:** `guchho.test.config.{ts,js,mjs,json}` with validation and
  CLI-over-config precedence.
- **Coverage:** V8 coverage with source-map mapping, text/HTML/JSON/LCOV/Cobertura
  reports, and global or per-file thresholds.
- **Reporters:** built-in `default`, `verbose`, `dot`, `json`, `junit`, `tap`,
  and GitHub Actions annotations, plus plugin-provided custom reporters.

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

Continue with [Installation](./installation.md).
