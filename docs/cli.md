---
title: CLI Reference
description: Commands, options, filters, reporters, and exit codes for the guchho-test binary.
date: "2026-11-02"
---

# CLI Reference

The command-line binary is `guchho-test`.

```bash
guchho-test [command] [files...] [options]
```

With no command, `run` is used.

The CLI runs a single pass by default, or starts watch mode with `watch` or
`--watch`. Commands accept file arguments, filters, reporter selection, coverage
flags, sharding options, and worker controls.

## Commands

| Command | Description                                           |
| ------- | ----------------------------------------------------- |
| `run`   | Run tests once (default).                             |
| `watch` | Run tests and rerun affected files when files change. |

`--run` is an alias for the `run` command. `--watch` is an alias for the `watch`
command. Only one command may be selected.

## Options

| Option                        | Description                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `--watch`                     | Alias for the `watch` command.                                                                                 |
| `--run`                       | Run tests once.                                                                                                |
| `--filter <text>`             | Only run tests whose full name contains `text`.                                                                |
| `--filter=<text>`             | Same as above in `=` form.                                                                                     |
| `--testNamePattern <pattern>` | Only run tests whose full name matches the regular expression.                                                 |
| `--testNamePattern=<pattern>` | Same as above in `=` form.                                                                                     |
| `--config <path>`             | Use an explicit configuration file.                                                                            |
| `--timeout <ms>`              | Override the per-test timeout.                                                                                 |
| `--reporter <name>`           | Select one built-in reporter: `default`, `verbose`, `dot`, `json`, `junit`, `tap`, `github`, `github-actions`. |
| `--update`, `-u`              | Create or update snapshots.                                                                                    |
| `--coverage`                  | Collect V8 coverage.                                                                                           |
| `--changed[=<ref>]`           | Run tests affected by uncommitted changes, or by changes since `<ref>`.                                        |
| `--related <path>`            | Run tests affected by a file. Repeat for multiple files.                                                       |
| `--listTests`                 | Print selected test files without running them.                                                                |
| `--passWithNoTests`           | Exit with code `0` when no tests are selected.                                                                 |
| `--silent`                    | Suppress console output from test files.                                                                       |
| `--bail`                      | Stop after the first failure. Forces a single worker.                                                          |
| `--maxWorkers <count>`        | Run files in parallel using up to `count` workers.                                                             |
| `--pool <name>`               | Execution pool: `threads` (default) or `forks`.                                                                |
| `--shard <index>/<count>`     | Run only the given shard of selected test files.                                                               |
| `--shard=<index>/<count>`     | Same as above in `=` form.                                                                                     |
| `-h`, `--help`                | Show help.                                                                                                     |
| `-v`, `--version`             | Show the installed version.                                                                                    |
| `--`                          | Treat remaining arguments as file paths.                                                                       |

Value options accept both `--opt value` and `--opt=value`.

## Examples

```bash
guchho-test                                   # discover and run all tests
guchho-test run src/math.test.ts              # run specific files
guchho-test watch                             # watch and rerun affected tests
guchho-test run --filter math                 # substring filter on full names
guchho-test run --testNamePattern=^math       # regex filter
guchho-test run --bail                        # stop at first failure
guchho-test run --maxWorkers=4                # up to four parallel workers
guchho-test run --pool=forks                  # use child processes
guchho-test run --shard=1/3                   # first third of selected files
guchho-test run --reporter=json               # JSON output
guchho-test run --reporter=junit              # JUnit XML output
guchho-test run --coverage                    # V8 coverage
guchho-test run --update                      # create/update snapshots
guchho-test run --changed                     # tests affected by uncommitted changes
guchho-test run --changed=origin/main         # tests affected since a git ref
guchho-test run --related src/math.ts         # tests importing a file
guchho-test run --listTests                   # list selected files only
guchho-test run --passWithNoTests             # allow an empty selection
guchho-test run --silent                      # suppress test console output
```

## File arguments

When files are provided, they are resolved relative to the working directory.
Each must exist and be a file; discovery patterns are not applied. Duplicate
paths are removed.

When no files are provided, test files are discovered using the configured
`include`/`exclude` patterns and sorted for deterministic execution.

## Selecting affected tests

`--changed` selects tests affected by files changed in git. With no reference it
uses uncommitted changes (staged, unstaged, and untracked files) against `HEAD`.
Use `--changed=<ref>` to compare against a branch, tag, or commit. Refs are only
accepted in the `--changed=<ref>` form.

`--related <path>` selects tests affected by a specific file and may be repeated:

```bash
guchho-test run --related src/math.ts --related src/parser.ts
```

Both options use the same locally imported dependency graph as watch mode. They
can be combined with each other and with `--shard`. Watch mode does not support
`--changed`, `--related`, or `--listTests`.

## Listing tests

`--listTests` prints the absolute path of every selected test file, one per line,
without running tests. Selection from file arguments, `--changed`, `--related`,
and `--shard` is applied first.

## Empty selections

If no files are selected, the run normally exits with code `2`.
`--passWithNoTests` makes an empty selection exit with code `0` instead.

## Sharding

`--shard=<index>/<count>` runs a deterministic subset of the selected test files,
which is useful for splitting a run across CI jobs. Both numbers must be positive
integers and `1 <= index <= count`.

Shards are assigned round-robin over the file list, so every file runs in exactly
one shard and shards are balanced. For example, with `--shard=1/2` and files
`a`, `b`, `c`, `d`, the first shard runs `a` and `c`, and the second runs `b`
and `d`. Run all shards together to cover the full suite.

`--shard` cannot be combined with watch mode. A shard that selects no files exits
with code `2` and prints a message to stderr.

## Common workflows

```bash
# Run everything once
npx guchho-test

# Run one file
npx guchho-test src/math.test.js

# Focus on matching tests
npx guchho-test run --filter math

# Produce CI-friendly output
npx guchho-test run --reporter=junit --coverage

# Watch for changes
npx guchho-test watch
```

## Exit codes

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| `0`  | All selected tests passed.                                     |
| `1`  | At least one test failed, or a coverage threshold was not met. |
| `2`  | CLI, configuration, discovery, or execution error.             |

Execution errors include test files that fail to load, worker crashes, and
coverage collection/reporting errors. If no test files are found, the run exits
with code `2` (after printing `guchho-test: No test files found.` to stderr).
With `--passWithNoTests`, an empty discovery or empty shard exits with code `0`.

## Output streams

- Test results and summaries go to stdout.
- Warnings, execution errors, and coverage threshold messages go to stderr.
- When a machine-readable reporter (`json`, `junit`, `tap`, `github`, or
  `github-actions`) is selected, the text coverage summary is redirected to
  stderr so stdout stays parseable.

## Parallelism

- Default `--maxWorkers` is `1`.
- Default `--pool` is `threads`.
- `--bail` forces `maxWorkers` to `1`.
- Results are reported in deterministic file order even when files finish out of
  order.

## Related

- [Configuration](./configuration.md)
- [Watch Mode](./watch-mode.md)
- [Coverage](./coverage.md)
- [Reporters](./reporters.md)
