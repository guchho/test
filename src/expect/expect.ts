import {
  any,
  anything,
  arrayContaining,
  closeTo,
  objectContaining,
  stringContaining,
  stringMatching,
} from './asymmetric.js';
import type { AsymmetricMatcher } from './asymmetric.js';
import { formatDiff } from './diff.js';
import { AssertionError } from './errors.js';
import { addEqualityTest, deepEqual } from './equality.js';
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
  toMatchObject(expected: unknown): R;
  toHaveProperty(
    path: string | readonly (string | number)[],
    value?: unknown,
  ): R;
  toBeCloseTo(expected: number, digits?: number): R;
  toHaveBeenCalled(): R;
  toHaveBeenCalledTimes(expected: number): R;
  toHaveBeenCalledWith(...expected: unknown[]): R;
  toHaveBeenLastCalledWith(...expected: unknown[]): R;
  toHaveBeenNthCalledWith(callIndex: number, ...expected: unknown[]): R;
  toHaveReturned(): R;
  toHaveReturnedWith(expected: unknown): R;
  toHaveReturnedTimes(expected: number): R;
  toMatchSnapshot(
    propertiesOrHint?: Record<PropertyKey, unknown> | string,
    hint?: string,
  ): R;
  toMatchInlineSnapshot(
    propertiesOrSnapshot?: Record<PropertyKey, unknown> | string,
    snapshot?: string,
  ): R;
}

export type AsyncMatchers = Matchers<Promise<void>>;

export interface Expectation extends Matchers<void> {
  readonly not: Expectation;
  readonly resolves: AsyncExpectation;
  readonly rejects: AsyncExpectation;
}

export interface PollOptions {
  readonly timeout?: number;
  readonly interval?: number;
}

export interface PollExpectation extends Matchers<Promise<void>> {
  readonly not: PollExpectation;
}

export interface AsyncExpectation extends Matchers<Promise<void>> {
  readonly not: AsyncExpectation;
}

export interface AsymmetricMatchers {
  any(sample: Function): AsymmetricMatcher;
  anything(): AsymmetricMatcher;
  objectContaining(sample: Record<PropertyKey, unknown>): AsymmetricMatcher;
  arrayContaining(sample: readonly unknown[]): AsymmetricMatcher;
  stringContaining(sample: string): AsymmetricMatcher;
  stringMatching(sample: string | RegExp): AsymmetricMatcher;
  closeTo(expected: number, digits?: number): AsymmetricMatcher;
}

export interface Expect extends AsymmetricMatchers {
  <T = unknown>(actual: T): Expectation;
  soft<T = unknown>(actual: T): Expectation;
  poll<T = unknown>(
    callback: () => T | Promise<T>,
    options?: PollOptions,
  ): PollExpectation;
  extend(matchers: Record<string, Matcher>): void;
  addEqualityTest(test: EqualityTest): () => void;
}

interface ExpectState {
  readonly actual: unknown;
  readonly isNot: boolean;
  readonly mode: MatcherMode;
  readonly soft: boolean;
}

const matchers = new Map<string, Matcher>(Object.entries(builtInMatchers));

const reservedMatcherNames = new Set(['not', 'resolves', 'rejects']);

const softFailures: AssertionError[] = [];

const defaultPollTimeout = 1000;
const defaultPollInterval = 50;

export function resetSoftAssertions(): void {
  softFailures.length = 0;
}

export function takeSoftAssertions(): AssertionError[] {
  return softFailures.splice(0);
}

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

function handleSoftFailure(error: unknown, state: ExpectState): void {
  if (state.soft && error instanceof AssertionError) {
    softFailures.push(error);
    return;
  }

  throw error;
}

function createMatcherMethod(
  name: string,
  matcher: Matcher,
  state: ExpectState,
): (...expected: unknown[]) => void | Promise<void> {
  return (...expected: unknown[]): void | Promise<void> => {
    if (state.mode === 'sync') {
      try {
        runSyncMatcher(name, matcher, state, expected);
      } catch (error) {
        handleSoftFailure(error, state);
      }

      return;
    }

    return runAsyncMatcher(name, matcher, state, expected).catch((error) => {
      handleSoftFailure(error, state);
    });
  };
}

function assertPollOptions(options: PollOptions | undefined): {
  readonly timeout: number;
  readonly interval: number;
} {
  const timeout = options?.timeout ?? defaultPollTimeout;
  const interval = options?.interval ?? defaultPollInterval;

  if (
    typeof timeout !== 'number' ||
    !Number.isFinite(timeout) ||
    timeout <= 0
  ) {
    throw new TypeError(
      'expect.poll timeout must be a positive, finite number.',
    );
  }

  if (
    typeof interval !== 'number' ||
    !Number.isFinite(interval) ||
    interval <= 0
  ) {
    throw new TypeError(
      'expect.poll interval must be a positive, finite number.',
    );
  }

  return { timeout, interval };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatPollError(name: string, error: unknown, timeout: number): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(
    `expect.poll.${name}() did not pass within ${timeout}ms: ${String(error)}`,
  );
}

async function runPollMatcher(
  name: string,
  matcher: Matcher,
  callback: () => unknown,
  state: ExpectState,
  options: PollOptions | undefined,
  expected: readonly unknown[],
): Promise<void> {
  const { timeout, interval } = assertPollOptions(options);
  const start = Date.now();
  let lastError: unknown;

  for (;;) {
    let actual: unknown;
    let callbackFailed = false;

    try {
      actual = await callback();
    } catch (error) {
      callbackFailed = true;
      lastError = error;
    }

    if (!callbackFailed) {
      try {
        const context = createContext(state);
        const result = await matcher.call(context, actual, ...expected);
        runResult(result, state);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    const elapsed = Date.now() - start;
    if (elapsed >= timeout) {
      throw formatPollError(name, lastError, timeout);
    }

    await delay(Math.min(interval, timeout - elapsed));
  }
}

function createPollExpectation(
  callback: () => unknown,
  options: PollOptions | undefined,
  isNot: boolean,
): PollExpectation {
  if (typeof callback !== 'function') {
    throw new TypeError('expect.poll requires a callback function.');
  }

  assertPollOptions(options);

  const target: Record<string, unknown> = Object.create(null);

  for (const [name, matcher] of matchers) {
    target[name] = (...expected: unknown[]): Promise<void> =>
      runPollMatcher(
        name,
        matcher,
        callback,
        { actual: undefined, isNot, mode: 'sync', soft: false },
        options,
        expected,
      );
  }

  Object.defineProperty(target, 'not', {
    enumerable: true,
    get: (): PollExpectation =>
      createPollExpectation(callback, options, !isNot),
  });

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

      return (...expected: unknown[]): Promise<void> =>
        runPollMatcher(
          property,
          matcher,
          callback,
          { actual: undefined, isNot, mode: 'sync', soft: false },
          options,
          expected,
        );
    },
  }) as unknown as PollExpectation;
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
      get: (): Expectation => createExpectation({ ...state, mode: 'resolves' }),
    });

    Object.defineProperty(target, 'rejects', {
      enumerable: true,
      get: (): Expectation => createExpectation({ ...state, mode: 'rejects' }),
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
    createExpectation({ actual, isNot: false, mode: 'sync', soft: false }),
  {
    soft: <T>(actual: T): Expectation =>
      createExpectation({ actual, isNot: false, mode: 'sync', soft: true }),
    poll: <T>(
      callback: () => T | Promise<T>,
      options?: PollOptions,
    ): PollExpectation => createPollExpectation(callback, options, false),
    extend,
    addEqualityTest,
    any,
    anything,
    objectContaining,
    arrayContaining,
    stringContaining,
    stringMatching,
    closeTo,
  },
);
