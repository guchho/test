# Reporters

Reporters consume test results and write output. Select one built-in reporter
with `--reporter`, or configure several with the `reporters` option.

## Built-in reporters

### `default`

Prints each file, a line per test with status symbols, failure details, hook
errors, and a per-file summary. When more than one file runs, it also prints an
`Overall` summary.

### `verbose`

Like `default`, but prints `PASS`/`FAIL`/`SKIP`/`TODO` labels with full test
names and durations.

### `dot`

Prints one character per test:

| Symbol | Status     |
| ------ | ---------- |
| `.`    | passed     |
| `F`    | failed     |
| `S`    | skipped    |
| `T`    | todo       |
| `H`    | hook error |

At the end it lists failures and prints a summary.

### `json`

Writes a single JSON document to stdout:

```json
{
  "success": true,
  "duration": 12.3,
  "summary": {
    "total": 2,
    "passed": 2,
    "failed": 0,
    "skipped": 0,
    "todo": 0
  },
  "files": [
    {
      "file": "src/math.test.js",
      "summary": { "...": "..." },
      "duration": 5.1,
      "success": true,
      "results": [
        {
          "name": "adds",
          "fullName": "math > adds",
          "status": "passed",
          "duration": 1.2,
          "error": null
        }
      ],
      "errors": []
    }
  ]
}
```

Errors are serialized with `isError`, `name`, `message`, `stack`, and
`inspected` fields.

### `junit`

Writes JUnit XML to stdout with one `<testsuite>` per test file. Tests appear as
`<testcase>` elements; failures, skipped/todo tests, and hook errors are
represented. Suitable for CI systems that consume JUnit XML.

### `tap`

Writes TAP version 13 to stdout. Each test becomes an `ok` or `not ok` line,
skipped and todo tests use TAP directives, and failures include a YAML diagnostic
block. The plan is written at the end of the run.

### `github`

Writes GitHub Actions workflow commands to stdout. Failed tests and hook errors
become `::error` annotations with the test file and full test name. Output is
escaped according to the GitHub Actions workflow command rules. `github-actions`
is an alias for `github`.

## Selecting reporters

CLI (single, built-in only):

```bash
guchho-test run --reporter=verbose
```

Configuration (multiple, including custom):

```ts
export default defineConfig({
  reporters: ['default', ['json', { label: 'CI' }]],
});
```

A `--reporter` flag replaces the configured reporters with that single reporter.

## Reporter interface

Custom reporters implement any of these optional methods:

```ts
interface Reporter {
  onRunStart?(fileCount: number): void;
  onFileStart?(display: string): void;
  onTestResult?(result: TestResult, display: string): void;
  onHookError?(error: HookError, display: string): void;
  onFileFinish?(report: FileReport): void;
  onRunFinish?(report: RunReport): void;
}
```

Types:

```ts
interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
}

interface FileReport {
  display: string;
  results: readonly TestResult[];
  errors: readonly HookError[];
  summary: RunSummary;
  duration: number;
  success: boolean;
}

interface RunReport {
  files: readonly FileReport[];
  summary: RunSummary;
  duration: number;
  success: boolean;
}
```

## Custom reporters through plugins

Plugins contribute named reporters. Create `guchho-plugin.js`:

```js
import { definePlugin, defineReporter } from '@guchho/test';

export default definePlugin({
  name: 'example',
  reporters: {
    summary: defineReporter((options, io) => ({
      onRunFinish(report) {
        io.stdout(`${options.label}: ${report.summary.passed} passed\n`);
      },
    })),
  },
});
```

Configure it:

```ts
export default defineConfig({
  plugins: ['./guchho-plugin.js'],
  reporters: [['summary', { label: 'Tests' }]],
});
```

Details:

- Plugin paths resolve from the working directory.
- A plugin exports its object as the default export or as `plugin`.
- `defineReporter(factory)` returns the factory unchanged and provides typing.
- A factory receives `(options, io)` and returns a `Reporter`.
- `io` provides `stdout(text)` and `stderr(text)`.
- Duplicate custom reporter names across plugins are rejected.
- Custom names are only accepted in configuration when `plugins` is non-empty.
- CLI `--reporter` accepts built-in names only.

## Ordering and isolation

- Reporters receive events in file order.
- With multiple reporters, all receive each event.
- Reporters must not modify test execution; they only observe and write output.
