# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Setup modules through `setupFiles` and `setupFilesAfterEnv`, run in order
  before each test file with clear failures for missing or throwing modules.
- Project-level `globalSetup` and `globalTeardown` hooks that run once per test
  run in the main process.
- `--shard=<index>/<count>` to split test files deterministically across CI
  jobs.
- `--changed` and `--related` test selection using git changes and the local
  dependency graph.
- `--listTests` to print selected test files without executing them.
- `--passWithNoTests` to allow empty test selections.
- `--silent` to suppress console output from test files.
- TAP and GitHub Actions annotation reporters through `--reporter=tap`,
  `--reporter=github`, and `--reporter=github-actions`.
- Interactive watch mode keys: rerun all, filter, clear filter, and quit.
- `lcov` and `cobertura` coverage reporters.
- Per-file coverage thresholds through `coverage.thresholds.perFile`.
- Soft assertions with `expect.soft`.
- Polling assertions with `expect.poll`.
- Fake timers through `mock.useFakeTimers`, `advanceTimersByTime`,
  `advanceTimersToNextTimer`, `runAllTimers`, `runOnlyPendingTimers`,
  `setSystemTime`, and related helpers.
- TypeScript path alias resolution from `compilerOptions.paths`, with automatic
  `tsconfig.json` discovery and the `tsconfig` configuration option.
- Optional `jsdom` and `happy-dom` test environments through the `environment`
  and `environmentOptions` configuration options.
- Jest-compatible globals mode with `globals: true`.
- In-process runner API exported as `runTests`.
- CommonJS `require()` interception for `mock.module()`.
- Snapshot property matchers for `toMatchSnapshot` and `toMatchInlineSnapshot`.
- Obsolete snapshot warnings and pruning with `--update`, skipped when a filter
  is active.
- CI workflow matrix covering Linux, macOS, and Windows across Node.js 20, 22,
  and 24.
- Replaced ESLint with `guchho lint` and committed Prettier configuration with
  lint, format, and formatting-check scripts.
- Weekly Dependabot updates for npm packages and GitHub Actions.
- Coverage upload to Codecov from CI.
- Documentation link checking for relative files and heading anchors.

### Changed

- Updated TypeScript to `^5.9.3` and `@types/node` to the Node.js 24 line.
- Moved `remove-item` to `devDependencies`.
- Normalized text files to LF line endings through `.gitattributes`.

## [0.0.1] - 2026-10-31

### Added

- Repository foundation: package metadata and export map.
- Strict TypeScript configuration and build pipeline.
- Public configuration API (`defineConfig`) and default configuration.
- Bootstrap test suite using the Node.js test runner.
- Continuous integration across supported operating systems and Node.js versions.
- Core test runner with nested suites, synchronous and asynchronous tests, per-test
  timeouts, and `skip`/`only`/`todo` selection.
- Command-line runner with test discovery, name filtering, help, version output,
  deterministic execution, and documented exit codes.
- Fixture-based CLI integration tests and runner unit tests.
- Assertion engine with the documented core matchers, `not`, `resolves`, and
  `rejects`.
- Cycle-aware deep equality covering objects, arrays, Map, Set, Date, RegExp,
  errors, buffers, and typed arrays.
- Custom matchers, custom equality tests, contextual assertion errors, and
  line-based value diffs.
- Lifecycle hooks (`beforeAll`, `afterAll`, `beforeEach`, `afterEach`) with nested
  suite ordering, async hooks, timeout handling, and cleanup after failures.
- Mock functions with call, result, instance, and invocation-order tracking,
  implementations, one-time values, and resolved/rejected values.
- Spies with descriptor-aware restore, inherited method support, and validation
  for unsupported properties.
- Mock assertion matchers: `toHaveBeenCalled`, `toHaveBeenCalledTimes`, and
  `toHaveBeenCalledWith`.
- ESM module mocking through loader hooks with registration isolation, original
  module restore, and validation for unsupported scenarios.
- Configuration discovery (`guchho.test.config.{ts,js,mjs,json}`), explicit
  `--config`, validation with actionable errors, and CLI > config > defaults
  precedence.
- TypeScript test execution for `.ts`, `.mts`, and `.cts` (CommonJS transform),
  plus `.tsx` and `.jsx` transform support.
- Inline source maps so TypeScript stack traces point at the original source.
- Configuration and transform test suites, including generated declaration
  verification.
- Reporter system with `default`, `verbose`, `dot`, and `json` reporters,
  selectable through configuration or `--reporter`.
- Worker-based parallel file execution using `threads` or `forks`, with
  deterministic result ordering, `--maxWorkers`, and `--bail`.
- `--testNamePattern` filtering in addition to substring `--filter`.
- Watch mode with recursive file monitoring, debounced reruns, dependency
  tracking, added/deleted test discovery, and graceful shutdown.
- Worker failure diagnostics and execution exit code handling.
- Snapshot testing with deterministic serialization, external snapshot files,
  inline snapshots, and `--update`/`-u` support.
- V8 coverage collection with TypeScript source-map mapping, text/HTML/JSON
  reports, include/exclude filters, and per-metric thresholds.
- JUnit XML reporter for CI integrations.
- Plugin API for loading local plugins and registering custom reporters with
  configuration options.

[Unreleased]: https://github.com/guchho/test/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/guchho/test/releases/tag/v0.0.1
