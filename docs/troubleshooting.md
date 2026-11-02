# Troubleshooting

## `guchho-test: No test files found.`

The discovery patterns matched nothing. Check:

- the file name matches `**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}`;
- `include`/`exclude` in your configuration;
- you are running from the expected working directory.

This situation exits with code `2`.

## Some tests are silently skipped

If a test file registers `only` (or a suite uses `describe.only`), all tests not
marked `only` are reported as skipped. Remove the focus marker.

`skip` and `todo` tests are reported as `skipped`/`todo` by design.

## `Unknown option: ...`

The CLI rejects unrecognized flags. Run `guchho-test --help` to see supported
options. Use `--` before file paths that start with `-`.

## Configuration is rejected

Configuration errors name the file and option. Common causes:

- unknown top-level key (config is strict);
- `timeout` not a positive finite number;
- `include`/`exclude` not arrays of non-empty strings;
- an unknown reporter name;
- a coverage threshold above `100`;
- a custom reporter name without `plugins`.

Invalid configuration exits with code `2`.

## `Unknown reporter "name"`

CLI `--reporter` accepts only `default`, `verbose`, `dot`, `json`, `junit`, `tap`,
`github`, and `github-actions`. Custom reporters must be configured through
`plugins` and the `reporters` configuration array, not through the CLI flag.

## Example in a configuration file fails to load

- Ensure the file exports a default (or the loader can read it for `.json`).
- `.ts` configuration requires Node.js with loader-hook support;
- verify there are no syntax errors in the file.

## Test timed out

The default timeout is `5000` ms for tests and hooks. Increase it:

```bash
guchho-test run --timeout 15000
```

or per test:

```js
it('slow', async () => {
  // ...
}, 15000);
```

## A promise-returning matcher was used synchronously

Error text asks you to use `resolves`/`rejects`. Fix:

```js
await expect(Promise.resolve(1)).resolves.toBe(1);
```

## `expect(...).toHaveBeenCalled...` requires a mock

Pass a mock created with `mock.fn()` or `mock.spyOn()`. Plain functions are not
tracked.

## `mock.spyOn` fails

Spying requires:

- the property to exist;
- the property to be configurable;
- the property to be a function data property (not an accessor).

Inherited methods are supported; non-configurable properties are not.

## Module mock is not applied

Check:

- `mock.module()` runs before a dynamic `import()` of the module;
- the specifier is relative, absolute, or a `file:` URL (not a bare package
  name);
- the target file exists;
- you are not relying on a static import already evaluated at module load.

See [Mocking](./mocking.md#module-mocking).

## Snapshot missing or changed

Run with `--update` to create or update snapshots:

```bash
guchho-test run --update
```

For inline snapshots, the runner rewrites the literal in source. If it cannot
locate the call, verify you are running the test from the CLI and that source
maps are available for transformed files.

## Coverage numbers look wrong

- Ensure `coverage.include` covers the source you care about.
- Test files and `dist` are excluded by default.
- Coverage maps through source maps; untransformed or unmapped code may not be
  attributed correctly.

## Coverage thresholds fail the run

Threshold failures print each metric below its target and exit with code `1`.
Lower the threshold or add tests. Collection/reporting errors exit with code `2`.

## Worker crash or file failed to load

The CLI prints `Failed to load test file "..."` or `Failed while executing "..."`
and exits with code `2`. Check the stack trace for syntax errors, missing
imports, or worker-level failures.

## JSON output is mixed with other text

When using a machine reporter (`json`, `junit`, `tap`, `github`, or
`github-actions`), coverage text is redirected to stderr so stdout contains only
the machine-readable output.

## Tests behave differently in parallel

Each file runs in its own worker, so cross-file state should not leak. If tests
within a file share state, make them independent or use lifecycle hooks to reset
state. Use `--bail` only for fail-fast behavior; it also forces a single worker.
