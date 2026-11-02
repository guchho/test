---
title: API Reference
description: Runtime exports, types, test options, and the programmatic runTests API.
date: "2026-11-02"
---

# API Reference

All runtime APIs are imported from the package root:

```js
import {
  describe,
  it,
  test,
  suite,
  expect,
  mock,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  defineConfig,
  definePlugin,
  defineReporter,
  runTests,
  AssertionError,
  version,
} from '@guchho/test';
```

Configuration helpers and defaults are also available from `@guchho/test/config`.

The package exposes test registration, assertions, mocks, lifecycle hooks,
configuration helpers, plugin and reporter factories, the programmatic
`runTests` API, and public types. Everything else is internal.

## Choosing an entry point

- Import runtime APIs from `@guchho/test`.
- Import configuration helpers and defaults from `@guchho/test/config`.
- Use `runTests` when embedding the runner in another tool.
- Import types with `import type` to avoid runtime work.

## Test registration

### `describe(name, fn)`

Registers a suite. `fn` is called immediately to register nested suites and
tests. Names must be non-empty strings.

### `suite(name, fn)`

Alias of `describe`.

### `describe.skip(name, fn)` / `describe.only(name, fn)`

Registers a skipped or focused suite.

### `describe.concurrent(name, fn)`

Registers a suite whose tests, including tests in nested suites, run in parallel.
`describe.concurrent.each` generates concurrent suites from table cases.

### `it(name, fn?, options?)`

Registers a test. `fn` may be synchronous or return a promise. `options` may be
a timeout number or a `TestOptions` object. See [Test options](#test-options).

### `test(name, fn?, options?)`

Alias of `it`.

### `it.skip(name, fn?, options?)`

Registers a skipped test. The callback is optional.

### `it.only(name, fn?, options?)`

Registers a focused test.

### `it.todo(name)`

Registers a todo test with no callback.

### `it.concurrent(name, fn?, options?)`

Registers a test that runs in parallel with other concurrent tests in the same
suite. `it.concurrent.each` generates concurrent tests from table cases.

### `it.fails(name, fn?, options?)`

Registers a test that passes only when its callback fails. `it.fails.each`
generates failing tests from table cases.

### `it.runIf(condition)` / `it.skipIf(condition)`

Returns a test registrar that runs or skips based on `condition`. The returned
registrar supports `.each`.

### `it.retry(retries, name, fn?, options?)` / `it.retry(retries)`

Registers a test that is retried up to `retries` times. The curried form returns
a registrar that supports `.each`:

```js
it.retry('flaky', loadUser, 2);
it.retry(2)('flaky', loadUser);
```

Each attempt reruns `beforeEach` and `afterEach`; `beforeAll` and `afterAll` run
once per suite.

### Test options

```ts
interface TestOptions {
  timeout?: number;
  retry?: number;
}
```

`timeout` is a positive, finite number of milliseconds. `retry` is a
non-negative integer.

### `skip(name, fn?, options?)`

Standalone function equivalent to `it.skip`.

### `only(name, fn?, options?)`

Standalone function equivalent to `it.only`.

### `todo(name)`

Standalone function equivalent to `it.todo`.

### `DescribeApi`

```ts
interface DescribeApi {
  (name: string, fn: () => void): void;
  skip(name: string, fn: () => void): void;
  only(name: string, fn: () => void): void;
  concurrent: {
    (name: string, fn: () => void): void;
    each: EachDescribe;
  };
  each: EachDescribe;
}
```

### `TestApi`

```ts
interface TestApi {
  (
    name: string,
    fn?: () => void | Promise<unknown>,
    options?: number | TestOptions,
  ): void;
  skip(
    name: string,
    fn?: () => void | Promise<unknown>,
    options?: number | TestOptions,
  ): void;
  only(
    name: string,
    fn?: () => void | Promise<unknown>,
    options?: number | TestOptions,
  ): void;
  todo(name: string): void;
  fails: {
    (
      name: string,
      fn?: () => void | Promise<unknown>,
      options?: number | TestOptions,
    ): void;
    each: EachTest;
  };
  concurrent: {
    (
      name: string,
      fn?: () => void | Promise<unknown>,
      options?: number | TestOptions,
    ): void;
    each: EachTest;
  };
  runIf(condition: boolean): ConditionalTestApi;
  skipIf(condition: boolean): ConditionalTestApi;
  retry: RetryTestApi;
  each: EachTest;
}

interface ConditionalTestApi {
  (
    name: string,
    fn?: () => void | Promise<unknown>,
    options?: number | TestOptions,
  ): void;
  each: EachTest;
}

interface RetryTestApi {
  (
    name: string,
    fn?: () => void | Promise<unknown>,
    retries?: number,
    options?: number | TestOptions,
  ): void;
  (retries: number): RetryTestRegistrar;
}

interface RetryTestRegistrar {
  (
    name: string,
    fn?: () => void | Promise<unknown>,
    options?: number | TestOptions,
  ): void;
  each: EachTest;
}
```

`EachTest` and `EachDescribe` are the corresponding `each` method types.

## Lifecycle hooks

### `beforeAll(fn)`

Runs once before the suite's tests, in registration order.

### `beforeEach(fn)`

Runs before each test in the suite and nested suites.

### `afterEach(fn)`

Runs after each test, in reverse registration order.

### `afterAll(fn)`

Runs once after the suite, in reverse registration order.

Hooks may return a promise. See [Lifecycle Hooks](./lifecycle-hooks.md).

## `expect`

```ts
expect(actual): Expectation
expect.soft(actual): Expectation
expect.poll(callback, options?): PollExpectation
expect.extend(matchers): void
expect.addEqualityTest(test): () => void
expect.any(Constructor): AsymmetricMatcher
expect.anything(): AsymmetricMatcher
expect.objectContaining(object): AsymmetricMatcher
expect.arrayContaining(array): AsymmetricMatcher
expect.stringContaining(string): AsymmetricMatcher
expect.stringMatching(stringOrRegExp): AsymmetricMatcher
expect.closeTo(number, digits?): AsymmetricMatcher
```

### `expect(actual)`

Returns an expectation with all matchers, plus `not`, `resolves`, and `rejects`.

### `expect.soft(actual)`

Returns an expectation that records assertion failures instead of throwing, so
the rest of the test runs. The test fails once it finishes. Supports the same
matchers and modifiers as `expect(actual)`.

### `expect.poll(callback, options?)`

Retries a matcher against the callback result until it passes or the timeout
elapses. `options.timeout` defaults to `1000` ms and `options.interval` to `50`
ms. The callback may be synchronous or asynchronous. See
[Assertions](./assertions.md#polling-assertions).

### `expect.any` and other asymmetric matchers

Asymmetric matchers describe expected values inside other assertions. See
[Assertions](./assertions.md#asymmetric-matchers).

### `expect.extend(matchers)`

Registers custom matchers. See [Assertions](./assertions.md#custom-matchers).

### `expect.addEqualityTest(test)`

Registers a custom equality test and returns a disposer.

```ts
type EqualityTest = (
  actual: unknown,
  expected: unknown,
  equals: (actual: unknown, expected: unknown) => boolean,
) => boolean | undefined;
```

## `mock`

```ts
interface MockApi {
  fn(implementation?): MockFunction;
  spyOn(object, key): MockFunction;
  clearAll(): void;
  resetAll(): void;
  restoreAll(): void;
  module(specifier, factory): void;
  useFakeTimers(options?): void;
  useRealTimers(): void;
  advanceTimersByTime(milliseconds): void;
  advanceTimersToNextTimer(): number;
  runAllTimers(): void;
  runOnlyPendingTimers(): void;
  setSystemTime(time): void;
  getTimerCount(): number;
  clearAllTimers(): void;
  now(): number;
  isFakeTimers(): boolean;
}
```

Timer options accept `now`, `toFake`, and `loopLimit`. See
[Mocking](./mocking.md#fake-timers).

### `MockFunction` members

```ts
mock: MockState;
mockClear(): this;
mockReset(): this;
mockRestore(): this;
mockImplementation(fn): this;
mockImplementationOnce(fn): this;
mockReturnValue(value): this;
mockReturnValueOnce(value): this;
mockResolvedValue(value): this;
mockResolvedValueOnce(value): this;
mockRejectedValue(reason): this;
mockRejectedValueOnce(reason): this;
```

### `MockState`

```ts
interface MockState {
  readonly calls: readonly unknown[][];
  readonly results: readonly { type: 'return' | 'throw'; value: unknown }[];
  readonly instances: readonly unknown[];
  readonly invocationCallOrder: readonly number[];
  readonly lastCall: readonly unknown[] | undefined;
  clear(): void;
  reset(): void;
  restore(): void;
}
```

## `defineConfig`

```ts
defineConfig(config: GuchhoConfig): GuchhoConfig;
defineConfig(config: Promise<GuchhoConfig>): Promise<GuchhoConfig>;
```

Identity helper for configuration with typing. See
[Configuration](./configuration.md).

## `definePlugin` / `defineReporter`

```ts
interface GuchhoPlugin {
  readonly name: string;
  readonly reporters?: Readonly<Record<string, ReporterFactory>>;
}

type ReporterFactory = (
  options: Record<string, unknown>,
  io: ReporterIO,
) => Reporter;

definePlugin(plugin: GuchhoPlugin): GuchhoPlugin;
defineReporter(factory: ReporterFactory): ReporterFactory;
```

`definePlugin` validates the plugin shape. See [Reporters](./reporters.md).

## `runTests`

Runs test files in the current process and returns structured results. This is
useful for embedding Guchho Test in another tool, such as an editor integration
or custom CLI.

```js
import { runTests } from '@guchho/test';

const result = await runTests({
  files: ['tests/math.test.js'],
  timeout: 5000,
});

if (!result.success) {
  process.exitCode = 1;
}
```

```ts
interface RunTestsOptions {
  files: readonly string[];
  cwd?: string;
  timeout?: number;
  filter?: string;
  testNamePattern?: RegExp;
  bail?: boolean;
  setupFiles?: readonly string[];
  setupFilesAfterEnv?: readonly string[];
  globalSetup?: string;
  globalTeardown?: string;
  environment?: 'node' | 'jsdom' | 'happy-dom';
  environmentOptions?: Readonly<Record<string, unknown>>;
  globals?: boolean;
  tsconfig?: string;
  updateSnapshots?: boolean;
}

interface FileRunResult {
  file: string;
  results: readonly TestResult[];
  errors: readonly HookError[];
  summary: RunSummary;
  duration: number;
  success: boolean;
  testCount: number;
  obsoleteSnapshots: readonly string[];
  prunedSnapshots: readonly string[];
}

interface RunTestsResult {
  files: readonly FileRunResult[];
  summary: RunSummary;
  duration: number;
  success: boolean;
}
```

Files are resolved from `cwd` (the process working directory by default).
Setup files and global hooks use the same semantics as configuration. Inline
snapshot updates are supported with `updateSnapshots: true`.

The CLI remains the recommended entry point when you need worker isolation,
watch mode, reporters, coverage, or exit-code handling.

## `AssertionError`

```ts
class AssertionError extends Error {
  override readonly name = 'AssertionError';
}
```

Thrown when an assertion fails.

## `version`

```ts
const version: string;
```

The package version as a string.

## Exported types

### Assertion types

```ts
AsymmetricMatcher;
AsymmetricMatchers;
AsyncExpectation;
AsyncMatchers;
Equals;
EqualityTest;
Expect;
Expectation;
Matcher;
MatcherContext;
MatcherMode;
MatcherResult;
Matchers;
MatcherUtils;
```

### Runner types

```ts
DescribeApi;
EachCase;
EachDescribe;
EachTest;
HookError;
HookFunction;
HookType;
RunOptions;
RunResult;
RunSummary;
SuiteDefinition;
SuiteHooks;
SuiteItem;
TestApi;
TestDefinition;
TestFunction;
TestMode;
TestResult;
TestStatus;
```

### Config types

```ts
CoverageConfig;
CoverageReporterName;
CoverageThresholds;
EnvironmentName;
GuchhoConfig;
ReporterEntry;
ReporterName;
```

### Runner API types

```ts
FileRunResult;
RunTestsOptions;
RunTestsResult;
```

### Mock types

```ts
FakeTimerApi;
FakeTimerInstallOptions;
FakeTimerName;
MockApi;
MockFunction;
MockResult;
MockState;
```

### Environment types

```ts
InstalledEnvironment;
```

### Plugin and reporter types

```ts
GuchhoPlugin;
ReporterFactory;
FileReport;
Reporter;
ReporterIO;
RunReport;
```

### Coverage types

```ts
CoverageMetric;
CoverageReport;
CoverageTotals;
FileCoverage;
```

## Exports from `@guchho/test/config`

```ts
defineConfig;
defaultConfig;
defaultEnvironment;
defaultExclude;
defaultInclude;
defaultTimeout;
```

Plus the config types listed above.

## Internal modules

Only the package root and `@guchho/test/config` are public entry points. Other
modules under `dist` are internal and may change without notice.

## Related

- [Writing Tests](./writing-tests.md)
- [Assertions](./assertions.md)
- [Configuration](./configuration.md)
- [Reporters](./reporters.md)
