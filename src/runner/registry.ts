import type {
  HookFunction,
  HookType,
  SuiteDefinition,
  TestDefinition,
  TestFunction,
  TestMode,
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
  timeout?: number,
): void {
  assertName(name, 'test');
  assertTimeout(timeout);

  if (mode !== 'todo') {
    if (fn === undefined) {
      if (mode !== 'skip') {
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
    timeout,
  });
}

function registerHook(type: HookType, fn: HookFunction): void {
  assertFunction(fn, 'hook');
  currentSuite.hooks[type].push(fn);
}

export interface DescribeApi {
  (name: string, fn: () => void): void;
  skip(name: string, fn: () => void): void;
  only(name: string, fn: () => void): void;
}

export interface TestApi {
  (name: string, fn?: TestFunction, timeout?: number): void;
  skip(name: string, fn?: TestFunction, timeout?: number): void;
  only(name: string, fn?: TestFunction, timeout?: number): void;
  todo(name: string): void;
}

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
  },
);

export const suite: DescribeApi = describe;

export const it: TestApi = Object.assign(
  (name: string, fn?: TestFunction, timeout?: number): void => {
    registerTest(name, fn, 'normal', timeout);
  },
  {
    skip: (name: string, fn?: TestFunction, timeout?: number): void => {
      registerTest(name, fn, 'skip', timeout);
    },
    only: (name: string, fn?: TestFunction, timeout?: number): void => {
      registerTest(name, fn, 'only', timeout);
    },
    todo: (name: string): void => {
      registerTest(name, undefined, 'todo');
    },
  },
);

export const test: TestApi = it;

export function skip(
  name: string,
  fn?: TestFunction,
  timeout?: number,
): void {
  registerTest(name, fn, 'skip', timeout);
}

export function only(
  name: string,
  fn?: TestFunction,
  timeout?: number,
): void {
  registerTest(name, fn, 'only', timeout);
}

export function todo(name: string): void {
  registerTest(name, undefined, 'todo');
}

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

export type { TestDefinition };

reset();
