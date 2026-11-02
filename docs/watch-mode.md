---
title: Watch Mode
description: Rerun affected tests when files change, with dependency tracking and debouncing.
date: "2026-11-02"
---

# Watch Mode

Watch mode reruns only the tests affected by file changes.

Watch mode keeps a run loop alive, reruns the tests affected by each change, and
supports an interactive filter. It is intended for local development; CI should
use a single `run` invocation.

```bash
guchho-test watch
# or
guchho-test --watch
```

## Behavior

1. Discovers test files using the configured `include`/`exclude` patterns.
2. Runs all discovered tests once.
3. Watches the working directory recursively.
4. On change, waits for a short debounce (100 ms) and coalesces rapid edits.
5. Determines affected test files using a dependency graph built from local
   imports.
6. Reruns affected tests only.
7. Rebuilds the dependency graph after each run.

## Dependency tracking

The watcher parses source files with the TypeScript parser and resolves local
imports, including:

- relative specifiers (`./`, `../`);
- absolute paths;
- `file:` URLs;
- extensionless imports (tries `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`,
  `.mjs`, `.cjs`, and `index.*` files);
- TypeScript-style extension mapping (for example `./x.js` resolving
  `./x.ts`).

Bare package specifiers are not tracked.

## Added, removed, and changed files

- A newly added matching test file is discovered and run.
- Removed test files are dropped from the next run.
- Changes to unrelated files that no test imports do not trigger a run; the
  watcher logs `[watch] no tests affected by: ...`.
- Changes in `node_modules`, `.git`, `dist`, `coverage`, and `.cache` are ignored.

## Output

The watcher logs:

```text
[watch] running 2 test files
[watch]   src/a.test.js
[watch]   src/b.test.ts
[watch] run completed successfully
[watch] waiting for file changes
```

Test output follows the normal reporter output.

## Interactive keys

When standard input is a TTY, watch mode supports these keys:

| Key | Action                                                                          |
| --- | ------------------------------------------------------------------------------- |
| `r` | Rerun all discovered tests and clear the interactive filter.                    |
| `/` | Enter a test-name filter. Press `Enter` to apply and rerun, or `Esc` to cancel. |
| `c` | Clear the interactive filter and rerun all tests.                               |
| `q` | Quit watch mode.                                                                |

The interactive filter is combined with file-change reruns: changed files still
select affected test files, and the filter is applied when those files run.

## Stopping

Press `Ctrl+C` (SIGINT), `q` in interactive mode, or send SIGTERM. The watcher
aborts, closes the file watcher, waits for any in-flight run, and exits with code
`0`.

## Best practices

- Keep test files and source files under the watched working directory.
- Avoid generated output directories in `include` patterns.
- Use the interactive filter to focus on one area while iterating.
- Stop watch mode before running a full CI-style verification pass.

## Limitations

- Watch mode uses `fs.watch` with `{ recursive: true }` and therefore relies on
  platform support (available on Windows, macOS, and modern Linux).
- Only local file dependencies are tracked; package internals are not.
- Test file selection still honors `--filter` and `--testNamePattern` through the
  normal runner options. An interactive `/` filter overrides `--filter` until it
  is cleared.

## Related

- [CLI Reference](./cli.md)
- [Configuration](./configuration.md)
- [Writing Tests](./writing-tests.md)
- [Coverage](./coverage.md)
