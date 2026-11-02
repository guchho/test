---
title: Coverage
description: Collect V8 coverage, map it through source maps, and enforce thresholds.
date: "2026-11-02"
---

# Coverage

Guchho Test collects coverage with the V8 inspector and maps results back to
original source using inline source maps.

Coverage is opt-in per run or per configuration. Reports can be written as text,
HTML, JSON, LCOV, or Cobertura, and thresholds can fail the run with exit code
`1` when they are not met.

## Enabling coverage

Per run:

```bash
guchho-test run --coverage
```

Or in configuration:

```ts
import { defineConfig } from '@guchho/test';

export default defineConfig({
  coverage: {
    enabled: true,
    reporter: ['text', 'html', 'json', 'lcov', 'cobertura'],
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts'],
    reportsDirectory: 'coverage',
    thresholds: { lines: 90, functions: 85, branches: 80, statements: 90 },
  },
});
```

## Metrics

Reports include:

- statements;
- branches;
- functions;
- lines.

Coverage is collected per test file in its worker and merged into a single run
report. Files outside the working directory are ignored.

## Reporters

| Reporter    | Output                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| `text`      | A table written to stdout (or stderr when a machine reporter is active).  |
| `html`      | `coverage/index.html` with annotated source.                              |
| `json`      | `coverage/coverage.json` with totals and per-file metrics.                |
| `lcov`      | `coverage/lcov.info` in LCOV format for coverage viewers and CI services. |
| `cobertura` | `coverage/cobertura-coverage.xml` in Cobertura XML format.                |

The `text` table looks like:

```text
Coverage summary
File            |    % Stmts |   % Branch |    % Funcs |    % Lines
----------------|------------|------------|------------|------------
src/math.ts     |     100.00 |     100.00 |     100.00 |     100.00
All files       |     100.00 |     100.00 |     100.00 |     100.00
```

HTML reports annotate source lines with covered/uncovered highlighting and
include a summary table.

LCOV reports contain per-file function, branch, and line summaries plus `DA`
line-hit records. Cobertura reports contain line and branch rates, source paths,
and per-line hit counts. Both formats include only files in the coverage report.

JSON reports contain:

```json
{
  "totals": {
    "statements": { "total": 10, "covered": 9 },
    "branches": { "total": 4, "covered": 4 },
    "functions": { "total": 2, "covered": 2 },
    "lines": { "total": 8, "covered": 8 }
  },
  "files": []
}
```

## Include and exclude

Defaults:

```text
include: **/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}
exclude: **/node_modules/**
         **/dist/**
         **/tests/**
         **/*.test.*
         **/*.spec.*
         **/__snapshots__/**
         **/coverage/**
```

Patterns are matched against POSIX-style paths relative to the working
directory.

## Thresholds

Set minimum percentages for any metric:

```ts
coverage: {
  thresholds: {
    lines: 90,
    functions: 85,
    branches: 80,
    statements: 90,
  },
}
```

If a metric is below its threshold:

- the run prints `Coverage thresholds not met:` with each failure to stderr;
- the process exits with code `1`.

Threshold values must be between `0` and `100`.

Set `perFile: true` to apply the same metric thresholds to every file instead of
the overall totals:

```ts
coverage: {
  thresholds: {
    lines: 90,
    perFile: true,
  },
}
```

Per-file failures include the file path in the report:

```text
Coverage thresholds not met:
  src/math.ts: lines: 75.00% is below 90.00%
```

## Best practices

- Start with line coverage and add branch and function thresholds gradually.
- Exclude generated files, fixtures, and build output from collection.
- Treat coverage as a signal, not a target; focused assertions matter more.
- Run the same coverage command locally and in CI.

## Exit codes and errors

| Situation                                   | Exit code           |
| ------------------------------------------- | ------------------- |
| Coverage collected, thresholds met          | `0` (if tests pass) |
| Threshold not met                           | `1`                 |
| Coverage collection or report writing error | `2`                 |

Coverage collection errors are printed as `Failed to collect coverage: ...`.
Report writing errors are printed as `Failed to write coverage reports: ...`.

## Source maps

TypeScript and JSX test/source files are transformed with inline source maps, so
coverage offsets are mapped back to original file, line, and column. This keeps
reports tied to source rather than generated output.

## Related

- [Configuration](./configuration.md)
- [CLI Reference](./cli.md)
- [Reporters](./reporters.md)
- [TypeScript and JSX](./typescript.md)
