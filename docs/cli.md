# CLI Reference

The command-line binary is `guchho-test`.

```bash
guchho-test [command] [files...] [options]
```

With no command, `run` is used.

## Commands

| Command | Description |
|---|---|
| `run` | Run tests once (default). |
| `watch` | Run tests and rerun affected files when files change. |

`--run` is an alias for the `run` command. `--watch` is an alias for the `watch`
command. Only one command may be selected.

## Options

| Option | Description |
|---|---|
| `--watch` | Alias for the `watch` command. |
| `--run` | Run tests once. |
| `--filter <text>` | Only run tests whose full name contains `text`. |
| `--filter=<text>` | Same as above in `=` form. |
| `--testNamePattern <pattern>` | Only run tests whose full name matches the regular expression. |
| `--testNamePattern=<pattern>` | Same as above in `=` form. |
| `--config <path>` | Use an explicit configuration file. |
| `--timeout <ms>` | Override the per-test timeout. |
| `--reporter <name>` | Select one built-in reporter: `default`, `verbose`, `dot`, `json`, `junit`. |
| `--update`, `-u` | Create or update snapshots. |
| `--coverage` | Collect V8 coverage. |
| `--bail` | Stop after the first failure. Forces a single worker. |
| `--maxWorkers <count>` | Run files in parallel using up to `count` workers. |
| `--pool <name>` | Execution pool: `threads` (default) or `forks`. |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Show the installed version. |
| `--` | Treat remaining arguments as file paths. |

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
guchho-test run --reporter=json               # JSON output
guchho-test run --reporter=junit              # JUnit XML output
guchho-test run --coverage                    # V8 coverage
guchho-test run --update                      # create/update snapshots
```

## File arguments

When files are provided, they are resolved relative to the working directory.
Each must exist and be a file; discovery patterns are not applied. Duplicate
paths are removed.

When no files are provided, test files are discovered using the configured
`include`/`exclude` patterns and sorted for deterministic execution.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All selected tests passed. |
| `1` | At least one test failed, or a coverage threshold was not met. |
| `2` | CLI, configuration, discovery, or execution error. |

Execution errors include test files that fail to load, worker crashes, and
coverage collection/reporting errors. If no test files are found, the run exits
with code `2` (after printing `guchho-test: No test files found.` to stderr).

## Output streams

- Test results and summaries go to stdout.
- Warnings, execution errors, and coverage threshold messages go to stderr.
- When a machine-readable reporter (`json` or `junit`) is selected, the text
  coverage summary is redirected to stderr so stdout stays parseable.

## Parallelism

- Default `--maxWorkers` is `1`.
- Default `--pool` is `threads`.
- `--bail` forces `maxWorkers` to `1`.
- Results are reported in deterministic file order even when files finish out of
  order.
