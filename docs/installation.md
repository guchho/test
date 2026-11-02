---
title: Installation
description: Requirements and installation steps for @guchho/test and the guchho-test CLI.
date: "2026-11-02"
---

# Installation

This page covers the supported runtimes, the install command, and the first
checks to run after installation. Guchho Test is a development dependency and
does not need to be installed in production environments.

## Requirements

| Requirement | Minimum | Notes |
| --- | --- | --- |
| Node.js | `20.19.0` | Uses native ESM loader hooks. Check with `node --version`. |
| Package manager | npm-compatible | npm, pnpm, Yarn, and Bun all work with equivalent commands. |
| Module system | ESM | Set `"type": "module"` or use `.mjs` / `.mts` test files. |

## Install

```bash
npm install --save-dev @guchho/test
```

| Entry point | Purpose |
| --- | --- |
| `@guchho/test` | Main API, assertions, mocks, snapshots, and configuration types. |
| `@guchho/test/config` | Configuration helpers and defaults. |
| `guchho-test` | The command-line binary. |

## Verify the installation

```bash
npx guchho-test --version
npx guchho-test --help
```

## Example project

A complete `package.json` for an ESM project with a test script:

```json
{
  "name": "my-project",
  "type": "module",
  "scripts": {
    "test": "guchho-test run",
    "test:watch": "guchho-test watch",
    "test:coverage": "guchho-test run --coverage"
  },
  "devDependencies": {
    "@guchho/test": "^0.0.2"
  }
}
```

Add a test file at `src/math.test.js`:

```js
import { describe, it, expect } from '@guchho/test';

describe('math', () => {
  it('adds numbers', () => {
    expect(2 + 2).toBe(4);
  });
});
```

Then run:

```bash
npm test
```

## Default test discovery

Without arguments, the CLI discovers files matching:

```text
**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}
```

and ignores:

```text
**/node_modules/**
**/dist/**
**/.git/**
```

You can override these patterns with a [configuration file](./configuration.md).

## Installation checklist

- Node.js `>=20.19.0` is active (`node --version`).
- `@guchho/test` is listed under `devDependencies`.
- `npx guchho-test --version` prints the installed version.
- At least one test file matches the default discovery patterns.
- The test script is available through your package manager.

## Next steps

- [Quick Start](./quick-start.md)
- [Writing Tests](./writing-tests.md)
