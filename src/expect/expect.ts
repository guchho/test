import { formatDiff } from './diff.js';
import { AssertionError } from './errors.js';
import {
  addEqualityTest,
  deepEqual,
} from './equality.js';
import { formatValue } from './format.js';
import { builtInMatchers } from './matchers.js';
import type {
  EqualityTest,
  Matcher,
  MatcherContext,
  MatcherMode,
  MatcherResult,
} from './types.js';

export type {
  EqualityTest,
  Matcher,
  MatcherContext,
  MatcherMode,
  MatcherResult,
  MatcherUtils,
} from './types.js';

export interface Matchers<R = void> {
  toBe(expected: unknown): R;
  toEqual(expected: unknown): R;
  toStrictEqual(expected: unknown): R;
  toBeTruthy(): R;
  toBeFalsy(): R;
  toBeNull(): R;
  toBeUndefined(): R;
  toBeDefined(): R;
  toBeInstanceOf(expected: Function): R;
  toContain(expected: unknown): R;
  toMatch(expected: string | RegExp): R;
  toHaveLength(expected: number): R;
  toThrow(expected?: string | RegExp | Error | Function): R;
  toThrowError(expected?: string | RegExp | Error | Function): R;
  toBeGreaterThan(expected: number): R;
  toBeLessThan(expected: number): R;
  toBeGreaterThanOrEqual(expected: number): R;
  toBeLessThanOrEqual(expected: number): R;
  toHaveBeenCalled(): R;
  toHaveBeenCalledTimes(expected: number): R;
  toHaveBeenCalledWith(...expected: unknown[]): R;
  toMatchSnapshot(hint?: string): R;
  toMatchInlineSnapshot(snapshot?: string): R;
}

export type AsyncMatchers = Matchers<Promise<void>>;

export interface Expectation extends Matchers<void> {
  readonly not: Expectation;
  readonly resolves: AsyncExpectation;
  readonly rejects: AsyncExpectation;
}

export interface AsyncExpectation extends Matchers<Promise<void>> {
  readonly not: AsyncExpectation;
}

export interface Expect {
  <T = unknown>(actual: T): Expectation;
  extend(matchers: Record<string, Matcher>): void;
  addEqualityTest(test: EqualityTest): () => void;
}

interface ExpectState {
  readonly actual: unknown;
  readonly isNot: boolean;
  readonly mode: MatcherMode;
}

const matchers = new Map<string, Matcher>(
  Object.entries(builtInMatchers),
);

const reservedMatcherNames = new Set(['not', 'resolves', 'rejects']);

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function createContext(state: ExpectState): MatcherContext {
  return {
    isNot: state.isNot,
    mode: state.mode,
    equals: (actual: unknown, expected: unknown, strict = false): boolean =>
      deepEqual(actual, expected, strict),
    utils: {
      stringify: formatValue,
      printReceived: formatValue,
      printExpected: formatValue,
      diff: (expected: unknown, received: unknown): string =>
        formatDiff(formatValue(expected), formatValue(received)),
    },
  };
}

function runResult(result: MatcherResult, state: ExpectState): void {
  const pass = state.isNot ? !result.pass : result.pass;

  if (!pass) {
    throw new AssertionError(result.message());
  }
}

function runSyncMatcher(
  name: string,
  matcher: Matcher,
  state: ExpectState,
  expected: readonly unknown[],
): void {
  const context = createContext(state);
  const result = matcher.call(context, state.actual, ...expected);

  if (isPromiseLike(result)) {
    throw new TypeError(
      `Matcher "${name}" returned a promise during a synchronous assertion. Use expect(received).resolves or expect(received).rejects.`,
    );
  }

  runResult(result, state);
}

function asyncInvocation(state: ExpectState, name: string): string {
  const negation = state.isNot ? 'not.' : '';
  return `expect(received).${state.mode}.${negation}${name}()`;
}

async function runAsyncMatcher(
  name: string,
  matcher: Matcher,
  state: ExpectState,
  expected: readonly unknown[],
): Promise<void> {
  if (!isPromiseLike(state.actual)) {
    throw new AssertionError(
      [
        asyncInvocation(state, name),
        '',
        'Received value must be a promise or thenable.',
        `Received: ${formatValue(state.actual)}`,
      ].join('\n'),
    );
  }

  const context = createContext(state);
  let settledValue: unknown;
  let rejected = false;
  let rejection: unknown;

  try {
    settledValue = await state.actual;
  } catch (error) {
    rejected = true;
    rejection = error;
  }

  if (state.mode === 'resolves') {
    if (rejected) {
      throw new AssertionError(
        [
          asyncInvocation(state, name),
          '',
          'Expected promise to resolve, but it rejected.',
          `Received rejection: ${formatValue(rejection)}`,
        ].join('\n'),
      );
    }
  } else if (!rejected) {
    throw new AssertionError(
      [
        asyncInvocation(state, name),
        '',
        'Expected promise to reject, but it resolved.',
        `Received resolution: ${formatValue(settledValue)}`,
      ].join('\n'),
    );
  } else {
    settledValue = rejection;
  }

  const result = await matcher.call(context, settledValue, ...expected);
  runResult(result, state);
}

function createMatcherMethod(
  name: string,
  matcher: Matcher,
  state: ExpectState,
): (...expected: unknown[]) => void | Promise<void> {
  return (...expected: unknown[]): void | Promise<void> => {
    if (state.mode === 'sync') {
      runSyncMatcher(name, matcher, state, expected);
      return;
    }

    return runAsyncMatcher(name, matcher, state, expected);
  };
}

function createExpectation(state: ExpectState): Expectation {
  const target: Record<string, unknown> = Object.create(null);

  for (const [name, matcher] of matchers) {
    target[name] = createMatcherMethod(name, matcher, state);
  }

  Object.defineProperty(target, 'not', {
    enumerable: true,
    get: (): Expectation =>
      createExpectation({ ...state, isNot: !state.isNot }),
  });

  if (state.mode === 'sync') {
    Object.defineProperty(target, 'resolves', {
      enumerable: true,
      get: (): Expectation =>
        createExpectation({ ...state, mode: 'resolves' }),
    });

    Object.defineProperty(target, 'rejects', {
      enumerable: true,
      get: (): Expectation =>
        createExpectation({ ...state, mode: 'rejects' }),
    });
  }

  return new Proxy(target, {
    get: (proxyTarget, property, receiver): unknown => {
      if (typeof property === 'symbol') {
        return Reflect.get(proxyTarget, property, receiver);
      }

      if (property in proxyTarget) {
        return Reflect.get(proxyTarget, property, receiver);
      }

      const matcher = matchers.get(property);
      if (matcher === undefined) {
        return undefined;
      }

      return createMatcherMethod(property, matcher, state);
    },
  }) as unknown as Expectation;
}

function extend(extension: Record<string, Matcher>): void {
  if (extension === null || typeof extension !== 'object') {
    throw new TypeError('expect.extend expects an object of matchers.');
  }

  for (const [name, matcher] of Object.entries(extension)) {
    if (name.trim().length === 0) {
      throw new TypeError('Custom matcher names must be non-empty.');
    }

    if (reservedMatcherNames.has(name)) {
      throw new TypeError(`"${name}" is a reserved matcher name.`);
    }

    if (typeof matcher !== 'function') {
      throw new TypeError(`Custom matcher "${name}" must be a function.`);
    }
  }

  for (const [name, matcher] of Object.entries(extension)) {
    matchers.set(name, matcher);
  }
}

export const expect: Expect = Object.assign(
  <T>(actual: T): Expectation =>
    createExpectation({ actual, isNot: false, mode: 'sync' }),
  {
    extend,
    addEqualityTest,
  },
);
