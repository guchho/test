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
  AssertionError,
  version,
} from '@guchho/test';
```

Configuration helpers and defaults are also available from `@guchho/test/config`.

## Test registration

### `describe(name, fn)`

Registers a suite. `fn` is called immediately to register nested suites and
tests. Names must be non-empty strings.

### `suite(name, fn)`

Alias of `describe`.

### `describe.skip(name, fn)` / `describe.only(name, fn)`

Registers a skipped or focused suite.

### `it(name, fn?, timeout?)`

Registers a test. `fn` may be synchronous or return a promise. `timeout`
overrides the default per-test timeout in milliseconds and must be a positive
finite number.

### `test(name, fn?, timeout?)`

Alias of `it`.

### `it.skip(name, fn?, timeout?)`

Registers a skipped test. The callback is optional.

### `it.only(name, fn?, timeout?)`

Registers a focused test.

### `it.todo(name)`

Registers a todo test with no callback.

### `skip(name, fn?, timeout?)`

Standalone function equivalent to `it.skip`.

### `only(name, fn?, timeout?)`

Standalone function equivalent to `it.only`.

### `todo(name)`

Standalone function equivalent to `it.todo`.

### `DescribeApi`

```ts
interface DescribeApi {
  (name: string, fn: () => void): void;
  skip(name: string, fn: () => void): void;
  only(name: string, fn: () => void): void;
}
```

### `TestApi`

```ts
interface TestApi {
  (name: string, fn?: () => void | Promise<unknown>, timeout?: number): void;
  skip(name: string, fn?: () => void | Promise<unknown>, timeout?: number): void;
  only(name: string, fn?: () => void | Promise<unknown>, timeout?: number): void;
  todo(name: string): void;
}
```

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
expect.extend(matchers): void
expect.addEqualityTest(test): () => void
```

### `expect(actual)`

Returns an expectation with all matchers, plus `not`, `resolves`, and `rejects`.

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
}
```

See [Mocking](./mocking.md).

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
AsyncExpectation;
AsyncMatchers;
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
GuchhoConfig;
ReporterEntry;
ReporterName;
```

### Mock types

```ts
MockApi;
MockFunction;
MockResult;
MockState;
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
defaultExclude;
defaultInclude;
defaultTimeout;
```

Plus the config types listed above.

## Not part of the public API

The package does not export an in-process runner entry point. Tests are executed
through the `guchho-test` CLI, which provides discovery, isolation, workers,
reporting, and exit codes. Internal modules under `dist` are not public APIs.
