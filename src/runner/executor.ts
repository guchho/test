import { performance } from 'node:perf_hooks';

import { defaultTimeout } from '../config/defaults.js';
import { resetSoftAssertions, takeSoftAssertions } from '../expect/expect.js';
import { beginSnapshotTest, endSnapshotTest } from '../snapshot/session.js';
import type {
  HookError,
  HookFunction,
  HookType,
  RunOptions,
  RunResult,
  RunSummary,
  SuiteDefinition,
  TestDefinition,
  TestResult,
  TestStatus,
} from './types.js';

interface CollectedTest {
  readonly test: TestDefinition;
  readonly ancestorOnly: boolean;
  readonly ancestorSkipped: boolean;
}

interface ScopedHook {
  readonly suite: SuiteDefinition;
  readonly fn: HookFunction;
}

interface ExecutionState {
  readonly results: TestResult[];
  readonly errors: HookError[];
  readonly statuses: Map<TestDefinition, TestStatus>;
  readonly timeout: number;
  readonly bail: boolean;
  bailed: boolean;
  readonly onResult: ((result: TestResult) => void) | undefined;
}

function containsOnly(suite: SuiteDefinition): boolean {
  for (const item of suite.items) {
    if (item.kind === 'test') {
      if (item.mode === 'only') {
        return true;
      }
    } else if (item.mode === 'only' || containsOnly(item)) {
      return true;
    }
  }

  return false;
}

function collectTests(
  suite: SuiteDefinition,
  ancestorOnly: boolean,
  ancestorSkipped: boolean,
  collected: CollectedTest[],
): void {
  const only = ancestorOnly || suite.mode === 'only';
  const skipped = ancestorSkipped || suite.mode === 'skip';

  for (const item of suite.items) {
    if (item.kind === 'test') {
      collected.push({
        test: item,
        ancestorOnly: only,
        ancestorSkipped: skipped,
      });
    } else {
      collectTests(item, only, skipped, collected);
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function runWithTimeout(
  fn: () => void | PromiseLike<unknown>,
  timeout: number,
  label: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`${label} timed out after ${timeout}ms.`));
      }
    }, timeout);

    const onResolve = (): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    };

    const onReject = (error: unknown): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    };

    try {
      const result = fn();
      if (isPromiseLike(result)) {
        Promise.resolve(result).then(onResolve, onReject);
      } else {
        onResolve();
      }
    } catch (error) {
      onReject(error);
    }
  });
}

function createResult(
  test: TestDefinition,
  status: TestStatus,
  duration: number,
  error: unknown,
): TestResult {
  return {
    name: test.name,
    fullName: test.fullName,
    status,
    duration,
    error,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createSoftAssertionError(errors: readonly Error[]): Error {
  const error = new Error(errors.map(errorMessage).join('\n\n'));
  error.name = 'SoftAssertionError';
  return error;
}

function combineErrors(first: unknown, second: unknown): Error {
  return new Error(`${errorMessage(first)}\n\n${errorMessage(second)}`);
}

async function executeTest(
  test: TestDefinition,
  defaultTestTimeout: number,
  status: TestStatus,
): Promise<TestResult> {
  if (status !== 'passed' || test.fn === undefined) {
    return createResult(test, status, 0, undefined);
  }

  const timeout = test.timeout ?? defaultTestTimeout;
  const start = performance.now();
  const isFails = test.mode === 'fails';

  try {
    await runWithTimeout(test.fn, timeout, `Test "${test.fullName}"`);
    if (isFails) {
      return createResult(
        test,
        'failed',
        performance.now() - start,
        new Error('Expected test to fail but it passed.'),
      );
    }
    return createResult(test, 'passed', performance.now() - start, undefined);
  } catch (error) {
    if (isFails) {
      return createResult(test, 'passed', performance.now() - start, undefined);
    }
    return createResult(test, 'failed', performance.now() - start, error);
  }
}

function resolveStatus(collected: CollectedTest, hasOnly: boolean): TestStatus {
  const { test, ancestorOnly, ancestorSkipped } = collected;

  if (ancestorSkipped || test.mode === 'skip') {
    return 'skipped';
  }

  if (test.mode === 'todo' || test.fn === undefined) {
    return 'todo';
  }

  if (test.mode === 'fails' || test.mode === 'concurrent') {
    if (hasOnly && !ancestorOnly) {
      return 'skipped';
    }
    return 'passed';
  }

  if (hasOnly && !ancestorOnly && test.mode !== 'only') {
    return 'skipped';
  }

  return 'passed';
}

function summarize(results: readonly TestResult[]): RunSummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let todo = 0;

  for (const result of results) {
    switch (result.status) {
      case 'passed':
        passed += 1;
        break;
      case 'failed':
        failed += 1;
        break;
      case 'skipped':
        skipped += 1;
        break;
      case 'todo':
        todo += 1;
        break;
    }
  }

  return {
    total: results.length,
    passed,
    failed,
    skipped,
    todo,
  };
}

function suiteLabel(suite: SuiteDefinition): string {
  return suite.fullName.length > 0 ? suite.fullName : '<root>';
}

function recordResult(result: TestResult, state: ExecutionState): void {
  state.results.push(result);
  state.onResult?.(result);

  if (state.bail && result.status === 'failed') {
    state.bailed = true;
  }
}

interface HookOutcome {
  readonly passed: boolean;
  readonly error: unknown;
}

async function invokeHook(
  type: HookType,
  suite: SuiteDefinition,
  fn: HookFunction,
  state: ExecutionState,
): Promise<HookOutcome> {
  try {
    await runWithTimeout(
      fn,
      state.timeout,
      `Hook "${type}" in "${suiteLabel(suite)}"`,
    );
    return { passed: true, error: undefined };
  } catch (error) {
    return { passed: false, error };
  }
}

function recordHookFailure(
  type: HookType,
  suite: SuiteDefinition,
  error: unknown,
  state: ExecutionState,
): void {
  state.errors.push({ type, suite: suiteLabel(suite), error });
  if (state.bail) {
    state.bailed = true;
  }
}

async function runHook(
  type: HookType,
  suite: SuiteDefinition,
  fn: HookFunction,
  state: ExecutionState,
): Promise<boolean> {
  const outcome = await invokeHook(type, suite, fn, state);
  if (!outcome.passed) {
    recordHookFailure(type, suite, outcome.error, state);
  }
  return outcome.passed;
}

function suiteHasRunnableTest(
  suite: SuiteDefinition,
  statuses: Map<TestDefinition, TestStatus>,
): boolean {
  for (const item of suite.items) {
    if (item.kind === 'test') {
      if (statuses.get(item) === 'passed') {
        return true;
      }
    } else if (suiteHasRunnableTest(item, statuses)) {
      return true;
    }
  }

  return false;
}

function reportSkippedTests(
  suite: SuiteDefinition,
  state: ExecutionState,
): void {
  for (const item of suite.items) {
    if (item.kind === 'suite') {
      reportSkippedTests(item, state);
      continue;
    }

    const status = state.statuses.get(item);
    if (status === undefined) {
      continue;
    }

    const result = createResult(
      item,
      status === 'passed' ? 'skipped' : status,
      0,
      undefined,
    );
    recordResult(result, state);
  }
}

interface PendingHookError {
  readonly type: HookType;
  readonly suite: SuiteDefinition;
  readonly error: unknown;
}

async function executeTestWithHooks(
  test: TestDefinition,
  beforeEachHooks: readonly ScopedHook[],
  afterEachHooks: readonly ScopedHook[],
  state: ExecutionState,
): Promise<TestResult> {
  const attempts = (test.retry ?? 0) + 1;
  let result = createResult(test, 'passed', 0, undefined);
  let pendingErrors: PendingHookError[] = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const attemptErrors: PendingHookError[] = [];
    resetSoftAssertions();
    beginSnapshotTest(test.fullName);
    let hookFailure: { readonly error: unknown } | undefined;

    for (const hook of beforeEachHooks) {
      const outcome = await invokeHook(
        'beforeEach',
        hook.suite,
        hook.fn,
        state,
      );
      if (!outcome.passed) {
        hookFailure = { error: outcome.error };
        attemptErrors.push({
          type: 'beforeEach',
          suite: hook.suite,
          error: outcome.error,
        });
        break;
      }
    }

    if (hookFailure !== undefined) {
      if (test.mode === 'fails') {
        result = createResult(test, 'passed', 0, undefined);
      } else {
        result = createResult(test, 'failed', 0, hookFailure.error);
      }
    } else {
      result = await executeTest(test, state.timeout, 'passed');
    }

    for (let index = afterEachHooks.length - 1; index >= 0; index -= 1) {
      const hook = afterEachHooks[index];
      if (hook !== undefined) {
        const outcome = await invokeHook(
          'afterEach',
          hook.suite,
          hook.fn,
          state,
        );
        if (!outcome.passed) {
          attemptErrors.push({
            type: 'afterEach',
            suite: hook.suite,
            error: outcome.error,
          });
        }
      }
    }

    const softErrors = takeSoftAssertions();
    if (softErrors.length > 0) {
      const softError = createSoftAssertionError(softErrors);
      if (result.status === 'passed') {
        if (test.mode !== 'fails') {
          result = createResult(test, 'failed', result.duration, softError);
        }
      } else {
        result = createResult(
          test,
          result.status,
          result.duration,
          combineErrors(result.error, softError),
        );
      }
    }

    endSnapshotTest();
    pendingErrors = attemptErrors;

    if (result.status === 'passed') {
      break;
    }
  }

  for (const pending of pendingErrors) {
    recordHookFailure(pending.type, pending.suite, pending.error, state);
  }

  return result;
}

function isConcurrentTest(
  test: TestDefinition,
  suiteConcurrent: boolean,
): boolean {
  return suiteConcurrent || test.mode === 'concurrent';
}

async function executeConcurrentTests(
  tests: readonly TestDefinition[],
  beforeEachHooks: readonly ScopedHook[],
  afterEachHooks: readonly ScopedHook[],
  state: ExecutionState,
): Promise<void> {
  const results = await Promise.all(
    tests.map((test) =>
      executeTestWithHooks(test, beforeEachHooks, afterEachHooks, state),
    ),
  );

  for (const result of results) {
    recordResult(result, state);
  }
}

async function executeConcurrentSuite(
  suite: SuiteDefinition,
  beforeEachHooks: readonly ScopedHook[],
  afterEachHooks: readonly ScopedHook[],
  state: ExecutionState,
): Promise<void> {
  const tests: TestDefinition[] = [];
  const tasks: Promise<void>[] = [];

  for (const item of suite.items) {
    if (item.kind === 'suite') {
      continue;
    }

    const status = state.statuses.get(item);
    if (status === undefined) {
      continue;
    }

    if (status !== 'passed') {
      recordResult(createResult(item, status, 0, undefined), state);
      continue;
    }

    tests.push(item);
  }

  if (tests.length > 0) {
    tasks.push(
      executeConcurrentTests(tests, beforeEachHooks, afterEachHooks, state),
    );
  }

  for (const item of suite.items) {
    if (item.kind === 'suite') {
      tasks.push(
        executeSuite(item, beforeEachHooks, afterEachHooks, state, true),
      );
    }
  }

  await Promise.all(tasks);
}

async function executeSequentialSuite(
  suite: SuiteDefinition,
  beforeEachHooks: readonly ScopedHook[],
  afterEachHooks: readonly ScopedHook[],
  suiteConcurrent: boolean,
  state: ExecutionState,
): Promise<void> {
  let batch: TestDefinition[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) {
      return;
    }

    const tests = batch;
    batch = [];
    await executeConcurrentTests(tests, beforeEachHooks, afterEachHooks, state);
  };

  for (const item of suite.items) {
    if (state.bailed) {
      break;
    }

    if (item.kind === 'suite') {
      await flush();
      await executeSuite(
        item,
        beforeEachHooks,
        afterEachHooks,
        state,
        suiteConcurrent,
      );
      continue;
    }

    const status = state.statuses.get(item);
    if (status === undefined) {
      continue;
    }

    if (status !== 'passed') {
      await flush();
      recordResult(createResult(item, status, 0, undefined), state);
      continue;
    }

    if (isConcurrentTest(item, suiteConcurrent)) {
      batch.push(item);
      continue;
    }

    await flush();
    if (state.bailed) {
      break;
    }

    const result = await executeTestWithHooks(
      item,
      beforeEachHooks,
      afterEachHooks,
      state,
    );
    recordResult(result, state);
  }

  await flush();
}

async function executeSuite(
  suite: SuiteDefinition,
  ancestorBeforeEach: readonly ScopedHook[],
  ancestorAfterEach: readonly ScopedHook[],
  state: ExecutionState,
  ancestorConcurrent = false,
): Promise<void> {
  if (state.bailed || !suiteHasRunnableTest(suite, state.statuses)) {
    reportSkippedTests(suite, state);
    return;
  }

  const beforeEachHooks = [
    ...ancestorBeforeEach,
    ...suite.hooks.beforeEach.map((fn): ScopedHook => ({ suite, fn })),
  ];
  const afterEachHooks = [
    ...ancestorAfterEach,
    ...suite.hooks.afterEach.map((fn): ScopedHook => ({ suite, fn })),
  ];
  const suiteConcurrent = ancestorConcurrent || suite.mode === 'concurrent';

  let beforeAllFailed = false;

  for (const fn of suite.hooks.beforeAll) {
    const passed = await runHook('beforeAll', suite, fn, state);
    if (!passed) {
      beforeAllFailed = true;
      break;
    }
  }

  if (beforeAllFailed) {
    reportSkippedTests(suite, state);
  } else if (suiteConcurrent) {
    await executeConcurrentSuite(suite, beforeEachHooks, afterEachHooks, state);
  } else {
    await executeSequentialSuite(
      suite,
      beforeEachHooks,
      afterEachHooks,
      suiteConcurrent,
      state,
    );
  }

  for (let index = suite.hooks.afterAll.length - 1; index >= 0; index -= 1) {
    const fn = suite.hooks.afterAll[index];
    if (fn !== undefined) {
      await runHook('afterAll', suite, fn, state);
    }
  }
}

function sortResultsByRegistrationOrder(
  results: TestResult[],
  collected: readonly CollectedTest[],
): void {
  const positions = new Map<string, number>();

  for (let index = collected.length - 1; index >= 0; index -= 1) {
    const entry = collected[index];
    if (entry !== undefined) {
      positions.set(entry.test.fullName, index);
    }
  }

  results.sort((left, right) => {
    const leftIndex = positions.get(left.fullName) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = positions.get(right.fullName) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

export async function runSuite(
  rootSuite: SuiteDefinition,
  options: RunOptions = {},
): Promise<RunResult> {
  const start = performance.now();
  const collected: CollectedTest[] = [];
  collectTests(rootSuite, false, false, collected);

  const hasOnly = containsOnly(rootSuite);
  const filter = options.filter;
  const testNamePattern = options.testNamePattern;
  const statuses = new Map<TestDefinition, TestStatus>();

  for (const entry of collected) {
    if (filter !== undefined && !entry.test.fullName.includes(filter)) {
      continue;
    }

    if (testNamePattern !== undefined) {
      testNamePattern.lastIndex = 0;
      if (!testNamePattern.test(entry.test.fullName)) {
        continue;
      }
    }

    statuses.set(entry.test, resolveStatus(entry, hasOnly));
  }

  const state: ExecutionState = {
    results: [],
    errors: [],
    statuses,
    timeout: options.timeout ?? defaultTimeout,
    bail: options.bail ?? false,
    bailed: false,
    onResult: options.onResult,
  };

  await executeSuite(rootSuite, [], [], state);
  sortResultsByRegistrationOrder(state.results, collected);

  const summary = summarize(state.results);

  return {
    results: state.results,
    summary,
    errors: state.errors,
    duration: performance.now() - start,
    success: summary.failed === 0 && state.errors.length === 0,
  };
}
