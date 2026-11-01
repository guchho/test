import {
  assertEachCases,
  formatEachTitle,
  isEachCaseObject,
} from './each.js';
import type {
  HookFunction,
  HookType,
  SuiteDefinition,
  TestDefinition,
  TestFunction,
  TestMode,
  TestOptions,
} from './types.js';

const nameSeparator = ' > ';

let rootSuite: SuiteDefinition;
let currentSuite: SuiteDefinition;

function createSuite(
  name: string,
  mode: Exclude<TestMode, 'todo'>,
  parent: SuiteDefinition | undefined,
): SuiteDefinition {
  const fullName =
    parent !== undefined && parent.fullName.length > 0
      ? `${parent.fullName}${nameSeparator}${name}`
      : name;

  return {
    kind: 'suite',
    name,
    fullName,
    mode,
    parent,
    items: [],
    hooks: {
      beforeAll: [],
      afterAll: [],
      beforeEach: [],
      afterEach: [],
    },
  };
}

function reset(): void {
  rootSuite = createSuite('', 'normal', undefined);
  currentSuite = rootSuite;
}

function assertName(name: unknown, kind: 'suite' | 'test'): asserts name is string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError(`A ${kind} name must be a non-empty string.`);
  }
}

function assertFunction(
  fn: unknown,
  kind: 'suite' | 'test' | 'hook',
): asserts fn is (...args: never[]) => unknown {
  if (typeof fn !== 'function') {
    throw new TypeError(`The ${kind} callback must be a function.`);
  }
}

function assertTimeout(timeout: unknown): asserts timeout is number | undefined {
  if (timeout === undefined) {
    return;
  }

  if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
    throw new TypeError('Test timeout must be a positive, finite number.');
  }
}

function assertRetry(retry: unknown): asserts retry is number | undefined {
  if (retry === undefined) {
    return;
  }

  if (typeof retry !== 'number' || !Number.isInteger(retry) || retry < 0) {
    throw new TypeError('Test retry count must be a non-negative integer.');
  }
}

type TestRegistrationOptions = number | TestOptions | undefined;

interface NormalizedTestOptions {
  readonly timeout: number | undefined;
  readonly retry: number | undefined;
}

function normalizeTestOptions(
  options: TestRegistrationOptions,
): NormalizedTestOptions {
  if (options === undefined) {
    return { timeout: undefined, retry: undefined };
  }

  if (typeof options === 'number') {
    assertTimeout(options);
    return { timeout: options, retry: undefined };
  }

  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Test options must be a number or an options object.');
  }

  assertTimeout(options.timeout);
  assertRetry(options.retry);

  return { timeout: options.timeout, retry: options.retry };
}

function registerSuite(
  name: string,
  fn: () => void,
  mode: Exclude<TestMode, 'todo'>,
): void {
  assertName(name, 'suite');
  assertFunction(fn, 'suite');

  const suite = createSuite(name, mode, currentSuite);
  currentSuite.items.push(suite);

  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = suite.parent ?? rootSuite;
  }
}

function registerTest(
  name: string,
  fn: TestFunction | undefined,
  mode: TestMode,
  options?: TestRegistrationOptions,
  retryOverride?: number,
): void {
  assertName(name, 'test');

  const normalized = normalizeTestOptions(options);
  assertRetry(retryOverride);
  const retry = retryOverride ?? normalized.retry;

  if (mode !== 'todo') {
    if (fn === undefined) {
      if (mode !== 'skip' && mode !== 'fails') {
        throw new TypeError('The test callback must be a function.');
      }
    } else {
      assertFunction(fn, 'test');
    }
  }

  const fullName =
    currentSuite.fullName.length > 0
      ? `${currentSuite.fullName}${nameSeparator}${name}`
      : name;

  currentSuite.items.push({
    kind: 'test',
    name,
    fullName,
    fn,
    mode,
    timeout: normalized.timeout,
    retry,
  });
}

function registerHook(type: HookType, fn: HookFunction): void {
  assertFunction(fn, 'hook');
  currentSuite.hooks[type].push(fn);
}

type EachArguments = readonly unknown[];

type EachTestFunction = (...args: unknown[]) => void | Promise<unknown>;

function registerEachTests(
  cases: unknown,
  name: string,
  fn: EachTestFunction,
  options: TestRegistrationOptions,
  mode: TestMode,
  retryOverride?: number,
): void {
  assertEachCases(cases);
  assertName(name, 'test');
  assertFunction(fn, 'test');
  normalizeTestOptions(options);
  assertRetry(retryOverride);

  for (let index = 0; index < cases.length; index += 1) {
    const args = cases[index];
    if (args === undefined) {
      continue;
    }

    if (isEachCaseObject(args)) {
      registerTest(
        formatEachTitle(name, args, index),
        () => fn(args as any),
        mode,
        options,
        retryOverride,
      );
    } else if (Array.isArray(args)) {
      registerTest(
        formatEachTitle(name, args, index),
        () => fn(...(args as readonly unknown[])),
        mode,
        options,
        retryOverride,
      );
    } else {
      registerTest(
        formatEachTitle(name, args, index),
        () => fn(args as any),
        mode,
        options,
        retryOverride,
      );
    }
  }
}

function registerEachSuites(
  cases: unknown,
  name: string,
  fn: EachTestFunction,
  mode: Exclude<TestMode, 'todo'>,
): void {
  assertEachCases(cases);
  assertName(name, 'suite');
  assertFunction(fn, 'suite');

  for (let index = 0; index < cases.length; index += 1) {
    const args = cases[index];
    if (args === undefined) {
      continue;
    }

    if (isEachCaseObject(args)) {
      registerSuite(
        formatEachTitle(name, args, index),
        () => {
          void fn(args as any);
        },
        mode,
      );
    } else if (Array.isArray(args)) {
      registerSuite(
        formatEachTitle(name, args, index),
        () => {
          void fn(...(args as readonly unknown[]));
        },
        mode,
      );
    } else {
      registerSuite(
        formatEachTitle(name, args, index),
        () => {
          void fn(args as any);
        },
        mode,
      );
    }
  }
}

export interface EachTest {
  <TArgs extends EachArguments>(
    cases: readonly TArgs[] | readonly Record<string, unknown>[],
  ): (
    name: string,
    fn: (...args: TArgs) => void | Promise<unknown>,
    options?: number | TestOptions,
  ) => void;
  <TCase extends Record<string, unknown>>(
    cases: readonly TCase[],
  ): (
    name: string,
    fn: (arg: TCase) => void | Promise<unknown>,
    options?: number | TestOptions,
  ) => void;
}

export interface EachDescribe {
  <TArgs extends EachArguments>(
    cases: readonly TArgs[] | readonly Record<string, unknown>[],
  ): (name: string, fn: (...args: TArgs) => void) => void;
  <TCase extends Record<string, unknown>>(
    cases: readonly TCase[],
  ): (name: string, fn: (arg: TCase) => void) => void;
}

export interface DescribeApi {
  (name: string, fn: () => void): void;
  skip(name: string, fn: () => void): void;
  only(name: string, fn: () => void): void;
  concurrent: {
    (name: string, fn: () => void): void;
    each: EachDescribe;
  };
  each: EachDescribe;
}

export interface ConditionalTestApi {
  (name: string, fn?: TestFunction, options?: number | TestOptions): void;
  each: EachTest;
}

export interface RetryTestRegistrar {
  (name: string, fn?: TestFunction, options?: number | TestOptions): void;
  each: EachTest;
}

export interface RetryTestApi {
  (name: string, fn?: TestFunction, retries?: number, options?: number | TestOptions): void;
  (retries: number): RetryTestRegistrar;
}

export interface TestApi {
  (name: string, fn?: TestFunction, options?: number | TestOptions): void;
  skip(name: string, fn?: TestFunction, options?: number | TestOptions): void;
  only(name: string, fn?: TestFunction, options?: number | TestOptions): void;
  todo(name: string): void;
  fails: {
    (name: string, fn?: TestFunction, options?: number | TestOptions): void;
    each: EachTest;
  };
  concurrent: {
    (name: string, fn?: TestFunction, options?: number | TestOptions): void;
    each: EachTest;
  };
  runIf(condition: boolean): ConditionalTestApi;
  skipIf(condition: boolean): ConditionalTestApi;
  retry: RetryTestApi;
  each: EachTest;
}

function parseTableString(table: string): any[] {
  const lines = table
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));

  if (lines.length === 0) {
    throw new TypeError('each expects a non-empty array of cases.');
  }

  // Try to detect header with | separators
  const headerLine = lines[0] as string;
  if (headerLine.includes('|')) {
    const headers = headerLine
      .split('|')
      .map((h) => h.trim())
      .filter((h) => h.length > 0);

    const cases: any[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i] as string;
      if (!line.includes('|')) {
        continue;
      }
      const parts = line.split('|').map((p) => p.trim());
      const values: any[] = [];
      for (let j = 0; j < headers.length; j += 1) {
        const raw = parts[j] !== undefined ? (parts[j] as string) : '';
        // Try to parse numbers/booleans
        if (raw === 'true') {
          values.push(true);
        } else if (raw === 'false') {
          values.push(false);
        } else if (raw === 'null') {
          values.push(null);
        } else if (raw === 'undefined') {
          values.push(undefined);
        } else if (/^-?\d+(\.\d+)?$/.test(raw)) {
          values.push(Number(raw));
        } else {
          values.push(raw);
        }
      }
      const obj: Record<string, unknown> = {};
      for (let j = 0; j < headers.length; j += 1) {
        const h = headers[j] as string;
        obj[h] = values[j];
      }
      cases.push(obj);
    }
    return cases;
  }

  // Otherwise treat as array of arrays
  const cases: any[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    const parts = line.split(/\s+/).filter((p) => p.length > 0);
    const values: any[] = [];
    for (let j = 0; j < parts.length; j += 1) {
      const raw = parts[j] as string;
      if (raw === 'true') {
        values.push(true);
      } else if (raw === 'false') {
        values.push(false);
      } else if (raw === 'null') {
        values.push(null);
      } else if (raw === 'undefined') {
        values.push(undefined);
      } else if (/^-?\d+(\.\d+)?$/.test(raw)) {
        values.push(Number(raw));
      } else {
        values.push(raw);
      }
    }
    if (values.length > 0) {
      cases.push(values);
    }
  }
  return cases;
}

function createEach(caller: 'describe' | 'it') {
  const fn: any = function (...args: any[]) {
    // Tagged template form
    if (Array.isArray(args[0]) && 'raw' in args[0]) {
      const strings = args[0] as TemplateStringsArray;
      const values = args.slice(1);
      // Build table from template
      let table = strings[0] as string;
      for (let i = 0; i < values.length; i += 1) {
        table += String(values[i]) + ((strings[i + 1] as string) ?? '');
      }
      const cases = parseTableString(table);
      if (caller === 'describe') {
        return (name: string, cb: any) => {
          registerEachSuites(cases, name, cb, 'normal');
        };
      } else {
        return (name: string, cb: any, options?: number | TestOptions) => {
          registerEachTests(cases, name, cb, options, 'normal');
        };
      }
    }
    // Regular form
    const cases = args[0];
    if (caller === 'describe') {
      return (name: string, cb: any) => {
        registerEachSuites(cases, name, cb, 'normal');
      };
    } else {
      return (name: string, cb: any, timeout?: number) => {
        registerEachTests(cases, name, cb, timeout, 'normal');
      };
    }
  };
  return fn;
}

const eachDescribe: EachDescribe = createEach('describe') as EachDescribe;

const eachTest: EachTest = createEach('it') as EachTest;

function assertCondition(
  condition: unknown,
  kind: 'runIf' | 'skipIf',
): asserts condition is boolean {
  if (typeof condition !== 'boolean') {
    throw new TypeError(`The ${kind} condition must be a boolean.`);
  }
}

function createConditionalTest(condition: boolean): ConditionalTestApi {
  const mode: TestMode = condition ? 'normal' : 'skip';

  const register = (
    name: string,
    fn?: TestFunction,
    options?: number | TestOptions,
  ): void => {
    registerTest(name, fn, mode, options);
  };

  const each: EachTest = ((cases: unknown) => {
    return (name: string, fn: EachTestFunction, options?: number | TestOptions): void => {
      registerEachTests(cases, name, fn, options, mode);
    };
  }) as EachTest;

  return Object.assign(register, { each });
}

function createRetryRegistrar(retries: number): RetryTestRegistrar {
  assertRetry(retries);

  const register = (
    name: string,
    fn?: TestFunction,
    options?: number | TestOptions,
  ): void => {
    registerTest(name, fn, 'normal', options, retries);
  };

  const each: EachTest = ((cases: unknown) => {
    return (name: string, fn: EachTestFunction, options?: number | TestOptions): void => {
      registerEachTests(cases, name, fn, options, 'normal', retries);
    };
  }) as EachTest;

  return Object.assign(register, { each });
}

const retryTest: RetryTestApi = ((...args: unknown[]) => {
  if (
    typeof args[0] === 'number' &&
    (args.length === 1 || typeof args[1] !== 'string')
  ) {
    return createRetryRegistrar(args[0]);
  }

  const name = args[0] as string;
  const fn = args[1] as TestFunction | undefined;
  const retries = (args[2] as number | undefined) ?? 0;
  const options = args[3] as number | TestOptions | undefined;

  registerTest(name, fn, 'normal', options, retries);
}) as RetryTestApi;

export const describe: DescribeApi = Object.assign(
  (name: string, fn: () => void): void => {
    registerSuite(name, fn, 'normal');
  },
  {
    skip: (name: string, fn: () => void): void => {
      registerSuite(name, fn, 'skip');
    },
    only: (name: string, fn: () => void): void => {
      registerSuite(name, fn, 'only');
    },
    each: eachDescribe,
  },
) as any;

(describe as any).concurrent = (name: string, fn: () => void) => {
  registerSuite(name, fn, 'concurrent' as any);
};
(describe as any).concurrent.each = (cases: any) => {
  return (name: string, fn: any) => {
    registerEachSuites(cases, name, fn, 'concurrent' as any);
  };
};
export const suite: DescribeApi = describe;

export const it: TestApi = Object.assign(
  (name: string, fn?: TestFunction, options?: number | TestOptions): void => {
    registerTest(name, fn, 'normal', options);
  },
  {
    skip: (name: string, fn?: TestFunction, options?: number | TestOptions): void => {
      registerTest(name, fn, 'skip', options);
    },
    only: (name: string, fn?: TestFunction, options?: number | TestOptions): void => {
      registerTest(name, fn, 'only', options);
    },
    todo: (name: string): void => {
      registerTest(name, undefined, 'todo');
    },
    fails: (name: string, fn?: TestFunction, options?: number | TestOptions): void => {
      registerTest(name, fn, 'fails', options);
    },
    concurrent: (name: string, fn?: TestFunction, options?: number | TestOptions): void => {
      registerTest(name, fn, 'concurrent', options);
    },
    runIf: (condition: boolean): ConditionalTestApi => {
      assertCondition(condition, 'runIf');
      return createConditionalTest(condition);
    },
    skipIf: (condition: boolean): ConditionalTestApi => {
      assertCondition(condition, 'skipIf');
      return createConditionalTest(!condition);
    },
    retry: retryTest,
    each: eachTest,
  },
) as TestApi;

export const test: TestApi = it;

export function skip(
  name: string,
  fn?: TestFunction,
  options?: number | TestOptions,
): void {
  registerTest(name, fn, 'skip', options);
}

export function only(
  name: string,
  fn?: TestFunction,
  options?: number | TestOptions,
): void {
  registerTest(name, fn, 'only', options);
}

export function todo(name: string): void {
  registerTest(name, undefined, 'todo');
}

export const failsFn = function(
  name: string,
  fn?: TestFunction,
  options?: number | TestOptions,
): void {
  registerTest(name, fn, 'fails', options);
};

export function beforeAll(fn: HookFunction): void {
  registerHook('beforeAll', fn);
}

export function afterAll(fn: HookFunction): void {
  registerHook('afterAll', fn);
}

export function beforeEach(fn: HookFunction): void {
  registerHook('beforeEach', fn);
}

export function afterEach(fn: HookFunction): void {
  registerHook('afterEach', fn);
}

export function getRootSuite(): SuiteDefinition {
  return rootSuite;
}

export function resetRegistry(): void {
  reset();
}

export function getRegisteredTestCount(): number {
  return countTests(rootSuite);
}

function countTests(suite: SuiteDefinition): number {
  let count = 0;

  for (const item of suite.items) {
    if (item.kind === 'test') {
      count += 1;
    } else {
      count += countTests(item);
    }
  }

  return count;
}

(it as any).fails = failsFn;
(it as any).fails.each = (cases: any) => {
  return (name: string, fn: any, timeout?: number) => {
    assertEachCases(cases);
    assertName(name, 'test');
    assertFunction(fn, 'test');
    assertTimeout(timeout);
    for (let index = 0; index < cases.length; index += 1) {
      const args = cases[index];
      if (args === undefined) continue;
      if (isEachCaseObject(args)) {
        registerTest(formatEachTitle(name, args, index), (() => (fn as any)(args)) as TestFunction, 'fails', timeout);
      } else if (Array.isArray(args)) {
        registerTest(formatEachTitle(name, args, index), (() => (fn as any).apply(null, args as any[])) as TestFunction, 'fails', timeout);
      } else {
        registerTest(formatEachTitle(name, args, index), (() => (fn as any)(args)) as TestFunction, 'fails', timeout);
      }
    }
  };
};
(test as any).fails = (it as any).fails;
(it as any).concurrent = function(name: string, fn?: TestFunction, timeout?: number) {
  registerTest(name, fn, 'concurrent', timeout);
};
(it as any).concurrent.each = (cases: any) => {
  return (name: string, fn: any, timeout?: number) => {
    assertEachCases(cases);
    assertName(name, 'test');
    assertFunction(fn, 'test');
    assertTimeout(timeout);
    for (let index = 0; index < cases.length; index += 1) {
      const args = cases[index];
      if (args === undefined) continue;
      if (isEachCaseObject(args)) {
        registerTest(formatEachTitle(name, args, index), (() => (fn as any)(args)) as TestFunction, 'concurrent', timeout);
      } else if (Array.isArray(args)) {
        registerTest(formatEachTitle(name, args, index), (() => (fn as any).apply(null, args as any[])) as TestFunction, 'concurrent', timeout);
      } else {
        registerTest(formatEachTitle(name, args, index), (() => (fn as any)(args)) as TestFunction, 'concurrent', timeout);
      }
    }
  };
};
(test as any).concurrent = (it as any).concurrent;
export { failsFn as fails };

export type { EachCase } from './each.js';
export type { TestDefinition };

reset();
