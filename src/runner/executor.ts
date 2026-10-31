import { performance } from 'node:perf_hooks';

import { defaultTimeout } from '../config/defaults.js';
import {
  beginSnapshotTest,
  endSnapshotTest,
} from '../snapshot/session.js';
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
      collected.push({ test: item, ancestorOnly: only, ancestorSkipped: skipped });
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

  try {
    await runWithTimeout(test.fn, timeout, `Test "${test.fullName}"`);
    return createResult(test, 'passed', performance.now() - start, undefined);
  } catch (error) {
    return createResult(test, 'failed', performance.now() - start, error);
  }
}

function resolveStatus(
  collected: CollectedTest,
  hasOnly: boolean,
): TestStatus {
  const { test, ancestorOnly, ancestorSkipped } = collected;

  if (ancestorSkipped || test.mode === 'skip') {
    return 'skipped';
  }

  if (test.mode === 'todo' || test.fn === undefined) {
    return 'todo';
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

async function runHook(
  type: HookType,
  suite: SuiteDefinition,
  fn: HookFunction,
  state: ExecutionState,
): Promise<boolean> {
  try {
    await runWithTimeout(
      fn,
      state.timeout,
      `Hook "${type}" in "${suiteLabel(suite)}"`,
    );
    return true;
  } catch (error) {
    state.errors.push({ type, suite: suiteLabel(suite), error });
    if (state.bail) {
      state.bailed = true;
    }
    return false;
  }
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

async function executeTestWithHooks(
  test: TestDefinition,
  beforeEachHooks: readonly ScopedHook[],
  afterEachHooks: readonly ScopedHook[],
  state: ExecutionState,
): Promise<void> {
  beginSnapshotTest(test.fullName);
  let hookFailure: { readonly error: unknown } | undefined;

  for (const hook of beforeEachHooks) {
    const passed = await runHook('beforeEach', hook.suite, hook.fn, state);
    if (!passed) {
      hookFailure = { error: state.errors[state.errors.length - 1]?.error };
      break;
    }
  }

  let result: TestResult;
  if (hookFailure !== undefined) {
    result = createResult(test, 'failed', 0, hookFailure.error);
  } else {
    result = await executeTest(test, state.timeout, 'passed');
  }

  for (let index = afterEachHooks.length - 1; index >= 0; index -= 1) {
    const hook = afterEachHooks[index];
    if (hook !== undefined) {
      await runHook('afterEach', hook.suite, hook.fn, state);
    }
  }

  endSnapshotTest();
  recordResult(result, state);
}

async function executeSuite(
  suite: SuiteDefinition,
  ancestorBeforeEach: readonly ScopedHook[],
  ancestorAfterEach: readonly ScopedHook[],
  state: ExecutionState,
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
  } else {
    for (const item of suite.items) {
      if (state.bailed) {
        break;
      }

      if (item.kind === 'suite') {
        await executeSuite(
          item,
          beforeEachHooks,
          afterEachHooks,
          state,
        );
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

      await executeTestWithHooks(
        item,
        beforeEachHooks,
        afterEachHooks,
        state,
      );
    }
  }

  for (let index = suite.hooks.afterAll.length - 1; index >= 0; index -= 1) {
    const fn = suite.hooks.afterAll[index];
    if (fn !== undefined) {
      await runHook('afterAll', suite, fn, state);
    }
  }
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

  const summary = summarize(state.results);

  return {
    results: state.results,
    summary,
    errors: state.errors,
    duration: performance.now() - start,
    success: summary.failed === 0 && state.errors.length === 0,
  };
}
