---
title: Contributing
description: Repository layout, development workflow, testing, and release process.
---

# Contributing

## Repository layout

```text
src/
  cli/          command-line parsing, help, discovery, main entry
  config/       config types, defaults, loading, validation
  coverage/     V8 coverage collection and reporting
  expect/       assertions, matchers, equality, diffs, formatting
  mock/         mock functions, spies, module mocking, loader
  plugins/      plugin types and loading
  reporters/    built-in reporters and reporter types
  runner/       registry, table tests, executor, worker pool, serialization
  snapshot/     snapshot session, serialization, inline updates
  transform/    TypeScript/JSX loader and transformation
  utils/        glob matching
  watch/        watcher and dependency tracking
tests/          Node.js test-runner suites and fixtures
docs/           documentation
scripts/        repository maintenance scripts
.github/        CI workflows and dependency automation
ROADMAP.md      planned features and the release checklist
CHANGELOG.md    released and unreleased changes
```

## Setup

```bash
npm install
```

## Scripts

| Script                   | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `npm run clean`          | Remove `dist/`.                                         |
| `npm run build`          | Clean and compile with `tsconfig.build.json`.           |
| `npm run typecheck`      | Type-check with `tsconfig.json` (no emit).              |
| `npm run lint`           | Lint the source, tests, and scripts with `guchho lint`. |
| `npm run format`         | Format supported files with Prettier.                   |
| `npm run format:check`   | Check formatting without rewriting files.               |
| `npm run docs:links`     | Validate relative links and anchors in Markdown files.  |
| `npm test`               | Build, then run the test suite with `node --test`.      |
| `npm run test:coverage`  | Build and run the suite with LCOV coverage output.      |
| `npm run prepublishOnly` | Typecheck and test before publishing.                   |

## Development workflow

1. Inspect the relevant source and existing tests.
2. Add or update tests alongside the change.
3. Run `npm run lint`, `npm run format:check`, `npm run docs:links`,
   `npm run typecheck`, and `npm test`.
4. Use `npm run format` to apply formatting fixes.
5. Update documentation for any user-facing behavior change.
6. Update `CHANGELOG.md` under `[Unreleased]`.
7. Update `ROADMAP.md` when completing planned phases or items.

Do not commit unintended build output or unrelated changes.

## Code style

- Strict TypeScript; avoid `any` unless justified.
- ESM imports with explicit `.js` extensions in source.
- Small, focused modules; avoid unnecessary abstractions.
- No comments unless they clarify non-obvious behavior.
- Formatting is enforced by Prettier and linting by `guchho lint`. Both
  configurations are committed at the repository root.

## Tests

The project tests itself with `node:test`. Tests live in `tests/` and use built
output from `dist/` for the public API and CLI integration. Fixtures live in
`tests/fixtures/`.

Guidelines:

- Add regression tests for every bug fix.
- Prefer real temporary projects and filesystem fixtures for CLI behavior.
- Keep tests deterministic; avoid timing-dependent assertions where possible.
- Run the full suite before submitting changes.

`npm run test:coverage` writes LCOV and text reports below `coverage/`. CI uploads
`coverage/lcov.info` to Codecov from the Linux Node.js 24 job.

## Continuous integration

The CI workflow runs:

- linting, formatting checks, documentation link checks, and type checking on
  Linux with Node.js 24;
- the full test suite on Linux, macOS, and Windows across Node.js 20, 22, and
  24;
- coverage collection and upload on Linux with Node.js 24.

Dependabot checks npm packages and GitHub Actions weekly.

## Implementation rules

- Do not copy source code from other testing frameworks.
- Do not add placeholder or fake functionality.
- Do not document behavior that is not implemented and tested.
- Avoid new runtime dependencies without a concrete reason; the runtime relies on
  Node.js built-ins and the TypeScript compiler.
- Keep the public API stable and documented; do not expose internal modules.

## Documentation

Each page under `docs/` should describe implemented behavior with runnable
examples. When behavior changes:

- update the relevant page;
- update [API Reference](./api.md) if exports or signatures change;
- update the [CLI Reference](./cli.md) if flags change;
- add a changelog entry.

## Release

Releases are cut only with explicit approval. The release checklist lives in
[`ROADMAP.md`](https://github.com/guchho/test/blob/main/ROADMAP.md) and includes version bumps, changelog preparation, a
full verification pass, CI validation, and a package content audit.

Do not publish to npm or create a public release without permission.
