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
  runner/       registry, executor, worker pool, serialization
  snapshot/     snapshot session, serialization, inline updates
  transform/    TypeScript/JSX loader and transformation
  utils/        glob matching
  watch/        watcher and dependency tracking
tests/          Node.js test-runner suites and fixtures
docs/           documentation
```

## Setup

```bash
npm install
```

## Scripts

| Script | Description |
|---|---|
| `npm run clean` | Remove `dist/`. |
| `npm run build` | Clean and compile with `tsconfig.build.json`. |
| `npm run typecheck` | Type-check with `tsconfig.json` (no emit). |
| `npm test` | Build, then run the test suite with `node --test`. |
| `npm run prepublishOnly` | Typecheck and test before publishing. |

## Development workflow

1. Inspect the relevant source and existing tests.
2. Add or update tests alongside the change.
3. Run `npm run typecheck` and `npm test`.
4. Update documentation for any user-facing behavior change.
5. Update `CHANGELOG.md` under `[Unreleased]`.
6. Update `TODO.md` when completing planned phases or items.

Do not commit unintended build output or unrelated changes.

## Code style

- Strict TypeScript; avoid `any` unless justified.
- ESM imports with explicit `.js` extensions in source.
- Small, focused modules; avoid unnecessary abstractions.
- No comments unless they clarify non-obvious behavior.
- Follow the existing formatting and naming conventions.

## Tests

The project tests itself with `node:test`. Tests live in `tests/` and use built
output from `dist/` for the public API and CLI integration. Fixtures live in
`tests/fixtures/`.

Guidelines:

- Add regression tests for every bug fix.
- Prefer real temporary projects and filesystem fixtures for CLI behavior.
- Keep tests deterministic; avoid timing-dependent assertions where possible.
- Run the full suite before submitting changes.

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
`TODO.md` and includes version bumps, changelog preparation, a full verification
pass, CI validation, and a package content audit.

Do not publish to npm or create a public release without permission.
