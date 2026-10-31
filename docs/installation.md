# Installation

## Requirements

- Node.js `>=20.19.0`
- npm
- A project that uses ESM (`"type": "module"` in `package.json`) or ESM test
  files (`.mjs`, `.mts`)

## Install

```bash
npm install --save-dev @guchho/test
```

The package exposes:

- `@guchho/test` — the main API and configuration types.
- `@guchho/test/config` — configuration helpers and defaults.
- `guchho-test` — the command-line binary.

## Verify the installation

```bash
npx guchho-test --version
npx guchho-test --help
```

## Add a script

Add a test script to `package.json`:

```json
{
  "scripts": {
    "test": "guchho-test run"
  }
}
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

## Next steps

- [Quick Start](./quick-start.md)
- [Writing Tests](./writing-tests.md)
