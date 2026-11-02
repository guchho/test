import { isMockFunction } from '../mock/mock.js';
import { snapshotMatchers } from '../snapshot/matchers.js';
import type { MockFunction } from '../mock/mock.js';
import { isAsymmetricMatcher } from './asymmetric.js';
import { deepEqual } from './equality.js';
import type { Matcher, MatcherContext, MatcherResult } from './types.js';

interface MessageOptions {
  readonly hasExpected?: boolean;
  readonly expectedLabel?: string;
  readonly detail?: string;
}

function signature(
  context: MatcherContext,
  name: string,
  hasExpected: boolean,
): string {
  const mode = context.mode === 'sync' ? '' : `${context.mode}.`;
  const negation = context.isNot ? 'not.' : '';
  const expected = hasExpected ? 'expected' : '';
  return `expect(received).${mode}${negation}${name}(${expected})`;
}

function assertionMessage(
  context: MatcherContext,
  name: string,
  received: unknown,
  expected: unknown,
  options: MessageOptions = {},
): string {
  const hasExpected = options.hasExpected ?? true;
  const lines = [signature(context, name, hasExpected), ''];

  if (hasExpected) {
    const label =
      options.expectedLabel ?? context.utils.printExpected(expected);
    lines.push(`Expected: ${context.isNot ? `not ${label}` : label}`);
  }

  lines.push(`Received: ${context.utils.printReceived(received)}`);

  if (options.detail !== undefined) {
    lines.push('', options.detail);
  }

  return lines.join('\n');
}

function comparisonLabel(
  context: MatcherContext,
  operator: string,
  expected: unknown,
): string {
  return `${operator} ${context.utils.printExpected(expected)}`;
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    value !== null &&
    value !== undefined &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
      'function'
  );
}

function itemEquals(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) {
    return true;
  }

  return (
    actual !== null &&
    expected !== null &&
    typeof actual === 'object' &&
    typeof expected === 'object' &&
    deepEqual(actual, expected)
  );
}

type SeenObjectPairs = WeakMap<object, WeakSet<object>>;

function matchesObjectShape(
  actual: unknown,
  expected: unknown,
  seen: SeenObjectPairs = new WeakMap(),
): boolean {
  if (isAsymmetricMatcher(expected)) {
    return expected.asymmetricMatch(actual, deepEqual);
  }

  if (expected === null || typeof expected !== 'object') {
    return deepEqual(actual, expected);
  }

  if (actual === null || typeof actual !== 'object') {
    return false;
  }

  if (
    expected instanceof Date ||
    expected instanceof RegExp ||
    expected instanceof Map ||
    expected instanceof Set
  ) {
    return deepEqual(actual, expected);
  }

  let seenForActual = seen.get(actual);
  if (seenForActual === undefined) {
    seenForActual = new WeakSet<object>();
    seen.set(actual, seenForActual);
  }

  if (seenForActual.has(expected)) {
    return true;
  }

  seenForActual.add(expected);

  try {
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length !== expected.length) {
        return false;
      }

      return expected.every((value, index) =>
        matchesObjectShape(actual[index], value, seen),
      );
    }

    const record = actual as Record<PropertyKey, unknown>;
    const sample = expected as Record<PropertyKey, unknown>;

    for (const key of Reflect.ownKeys(expected)) {
      if (!Object.prototype.propertyIsEnumerable.call(expected, key)) {
        continue;
      }

      if (!(key in record)) {
        return false;
      }

      if (!matchesObjectShape(record[key], sample[key], seen)) {
        return false;
      }
    }

    return true;
  } finally {
    seenForActual.delete(expected);
  }
}

function toPropertyPath(path: unknown): PropertyKey[] {
  if (Array.isArray(path)) {
    if (path.length === 0) {
      throw new TypeError('toHaveProperty expects a non-empty property path.');
    }

    return path.map((segment) => {
      if (typeof segment !== 'string' && typeof segment !== 'number') {
        throw new TypeError(
          'toHaveProperty path segments must be strings or numbers.',
        );
      }

      return segment;
    });
  }

  if (typeof path !== 'string' || path.length === 0) {
    throw new TypeError(
      'toHaveProperty expects a string or array property path.',
    );
  }

  const segments: string[] = [];
  let index = 0;

  while (index < path.length) {
    if (path[index] === '.') {
      index += 1;
      continue;
    }

    if (path[index] === '[') {
      const close = path.indexOf(']', index);
      if (close === -1) {
        throw new TypeError(
          `toHaveProperty received an invalid property path "${path}".`,
        );
      }

      let segment = path.slice(index + 1, close).trim();
      if (
        (segment.startsWith('"') && segment.endsWith('"')) ||
        (segment.startsWith("'") && segment.endsWith("'"))
      ) {
        segment = segment.slice(1, -1);
      }

      if (segment.length === 0) {
        throw new TypeError(
          `toHaveProperty received an invalid property path "${path}".`,
        );
      }

      segments.push(segment);
      index = close + 1;
      continue;
    }

    let end = index;
    while (end < path.length && path[end] !== '.' && path[end] !== '[') {
      end += 1;
    }

    const segment = path.slice(index, end);
    if (segment.length === 0) {
      throw new TypeError(
        `toHaveProperty received an invalid property path "${path}".`,
      );
    }

    segments.push(segment);
    index = end;
  }

  if (segments.length === 0) {
    throw new TypeError('toHaveProperty expects a non-empty property path.');
  }

  return segments;
}

function readPropertyPath(
  actual: unknown,
  path: readonly PropertyKey[],
): { readonly found: boolean; readonly value: unknown } {
  let current = actual;

  for (const segment of path) {
    if (
      current === null ||
      current === undefined ||
      (typeof current !== 'object' && typeof current !== 'function')
    ) {
      return { found: false, value: undefined };
    }

    const record = current as Record<PropertyKey, unknown>;
    if (!(segment in record)) {
      return { found: false, value: undefined };
    }

    current = record[segment];
  }

  return { found: true, value: current };
}

function isCloseTo(actual: unknown, expected: number, digits: number): boolean {
  if (typeof actual !== 'number' || Number.isNaN(actual)) {
    return false;
  }

  if (Object.is(actual, expected)) {
    return true;
  }

  return Math.abs(actual - expected) < 10 ** -digits / 2;
}

function lengthOf(value: unknown): number | undefined {
  if (typeof value === 'string') {
    return value.length;
  }

  if (Array.isArray(value)) {
    return value.length;
  }

  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return (value as unknown as { length: number }).length;
  }

  if (value instanceof Map || value instanceof Set) {
    return value.size;
  }

  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { length?: unknown }).length === 'number'
  ) {
    return (value as { length: number }).length;
  }

  return undefined;
}

function thrownMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function matchesThrownValue(thrown: unknown, expected: unknown): boolean {
  if (typeof expected === 'string') {
    return thrownMessage(thrown).includes(expected);
  }

  if (expected instanceof RegExp) {
    const pattern = new RegExp(expected.source, expected.flags);
    return pattern.test(thrownMessage(thrown));
  }

  if (typeof expected === 'function') {
    return thrown instanceof expected;
  }

  if (expected instanceof Error) {
    return thrown instanceof Error && thrown.message === expected.message;
  }

  throw new TypeError(
    'toThrow/toThrowError expects a string, regular expression, error class, or error instance.',
  );
}

function expectedThrowDescription(
  context: MatcherContext,
  expected: unknown,
): string {
  if (typeof expected === 'string') {
    return ` with a message containing ${context.utils.printExpected(expected)}`;
  }

  if (expected instanceof RegExp) {
    return ` matching ${context.utils.printExpected(expected)}`;
  }

  if (typeof expected === 'function') {
    return ` an instance of ${expected.name.length > 0 ? expected.name : 'the expected constructor'}`;
  }

  if (expected instanceof Error) {
    return ` with the message ${context.utils.printExpected(expected.message)}`;
  }

  return '';
}

function requireMock(value: unknown, name: string): MockFunction {
  if (!isMockFunction(value)) {
    throw new TypeError(
      `expect(received).${name}() requires the received value to be a mock function.`,
    );
  }

  return value;
}

function formatCalls(context: MatcherContext, mock: MockFunction): string {
  if (mock.mock.calls.length === 0) {
    return 'Received: the mock function was never called.';
  }

  return `Received calls: ${context.utils.printReceived(mock.mock.calls)}`;
}

function returnValues(mock: MockFunction): unknown[] {
  return mock.mock.results
    .filter((result) => result.type === 'return')
    .map((result) => result.value);
}

function matchThrow(
  context: MatcherContext,
  name: 'toThrow' | 'toThrowError',
  actual: unknown,
  expectedArguments: readonly unknown[],
): MatcherResult {
  let didThrow = false;
  let thrown: unknown;
  let returned: unknown;

  if (typeof actual === 'function') {
    try {
      returned = actual();
    } catch (error) {
      didThrow = true;
      thrown = error;
    }

    if (!didThrow && returned !== null && returned !== undefined) {
      const maybePromise = returned as { then?: unknown };
      if (typeof maybePromise.then === 'function') {
        void Promise.resolve(returned).catch(() => {});
        throw new TypeError(
          `expect(received).${name}() received a function that returned a promise. Use await expect(received).rejects.${name}() instead.`,
        );
      }
    }
  } else if (context.mode === 'rejects') {
    didThrow = true;
    thrown = actual;
  } else {
    throw new TypeError(
      `expect(received).${name}() requires the received value to be a function.`,
    );
  }

  const hasExpected =
    expectedArguments.length > 0 && expectedArguments[0] !== undefined;
  const expected = expectedArguments[0];
  const matched = hasExpected
    ? didThrow && matchesThrownValue(thrown, expected)
    : didThrow;

  return {
    pass: matched,
    message: (): string => {
      const mode = context.mode === 'sync' ? '' : `${context.mode}.`;
      const invocation = `expect(received).${mode}${context.isNot ? 'not.' : ''}${name}(${hasExpected ? 'expected' : ''})`;
      const description = hasExpected
        ? expectedThrowDescription(context, expected)
        : '';

      if (context.isNot) {
        return [
          invocation,
          '',
          `Expected function not to throw${description}, but it threw:`,
          context.utils.printReceived(thrown),
        ].join('\n');
      }

      if (!didThrow) {
        return [
          invocation,
          '',
          `Expected function to throw${description}.`,
          'Received: function did not throw.',
        ].join('\n');
      }

      return [
        invocation,
        '',
        `Expected function to throw${description}.`,
        `Received thrown value: ${context.utils.printReceived(thrown)}`,
      ].join('\n');
    },
  };
}

export const builtInMatchers: Record<string, Matcher> = {
  ...snapshotMatchers,

  toBe(actual, expected) {
    return {
      pass: Object.is(actual, expected),
      message: (): string =>
        assertionMessage(this, 'toBe', actual, expected, {
          expectedLabel: this.utils.printExpected(expected),
        }),
    };
  },

  toEqual(actual, expected) {
    return {
      pass: deepEqual(actual, expected),
      message: (): string =>
        assertionMessage(this, 'toEqual', actual, expected, {
          detail: `Difference (- expected, + received):\n${this.utils.diff(expected, actual)}`,
        }),
    };
  },

  toStrictEqual(actual, expected) {
    return {
      pass: deepEqual(actual, expected, true),
      message: (): string =>
        assertionMessage(this, 'toStrictEqual', actual, expected, {
          detail: `Difference (- expected, + received):\n${this.utils.diff(expected, actual)}`,
        }),
    };
  },

  toBeTruthy(actual) {
    return {
      pass: Boolean(actual),
      message: (): string =>
        assertionMessage(this, 'toBeTruthy', actual, undefined, {
          hasExpected: false,
        }),
    };
  },

  toBeFalsy(actual) {
    return {
      pass: !actual,
      message: (): string =>
        assertionMessage(this, 'toBeFalsy', actual, undefined, {
          hasExpected: false,
        }),
    };
  },

  toBeNull(actual) {
    return {
      pass: actual === null,
      message: (): string =>
        assertionMessage(this, 'toBeNull', actual, undefined, {
          hasExpected: false,
        }),
    };
  },

  toBeUndefined(actual) {
    return {
      pass: actual === undefined,
      message: (): string =>
        assertionMessage(this, 'toBeUndefined', actual, undefined, {
          hasExpected: false,
        }),
    };
  },

  toBeDefined(actual) {
    return {
      pass: actual !== undefined,
      message: (): string =>
        assertionMessage(this, 'toBeDefined', actual, undefined, {
          hasExpected: false,
        }),
    };
  },

  toBeInstanceOf(actual, expected) {
    if (typeof expected !== 'function') {
      throw new TypeError('toBeInstanceOf expects a constructor function.');
    }

    return {
      pass: actual instanceof expected,
      message: (): string =>
        assertionMessage(this, 'toBeInstanceOf', actual, expected, {
          expectedLabel: `instance of ${expected.name.length > 0 ? expected.name : 'constructor'}`,
        }),
    };
  },

  toContain(actual, expected) {
    let pass = false;

    if (typeof actual === 'string') {
      if (typeof expected !== 'string') {
        throw new TypeError(
          'toContain expects a string when the received value is a string.',
        );
      }

      pass = actual.includes(expected);
    } else if (isIterable(actual)) {
      for (const item of actual) {
        if (itemEquals(item, expected)) {
          pass = true;
          break;
        }
      }
    } else {
      throw new TypeError(
        'toContain requires the received value to be a string or iterable.',
      );
    }

    return {
      pass,
      message: (): string =>
        assertionMessage(this, 'toContain', actual, expected),
    };
  },

  toMatch(actual, expected) {
    if (typeof actual !== 'string') {
      throw new TypeError(
        'toMatch requires the received value to be a string.',
      );
    }

    let pass: boolean;

    if (typeof expected === 'string') {
      pass = actual.includes(expected);
    } else if (expected instanceof RegExp) {
      const pattern = new RegExp(expected.source, expected.flags);
      pass = pattern.test(actual);
    } else {
      throw new TypeError('toMatch expects a string or regular expression.');
    }

    return {
      pass,
      message: (): string =>
        assertionMessage(this, 'toMatch', actual, expected),
    };
  },

  toHaveLength(actual, expected) {
    if (
      typeof expected !== 'number' ||
      !Number.isInteger(expected) ||
      expected < 0
    ) {
      throw new TypeError(
        'toHaveLength expects a non-negative integer length.',
      );
    }

    const length = lengthOf(actual);

    if (length === undefined) {
      throw new TypeError(
        'toHaveLength requires the received value to expose a length or size.',
      );
    }

    return {
      pass: length === expected,
      message: (): string =>
        assertionMessage(this, 'toHaveLength', actual, expected, {
          detail: `Received length: ${length}`,
        }),
    };
  },

  toThrow(actual, ...expected) {
    return matchThrow(this, 'toThrow', actual, expected);
  },

  toThrowError(actual, ...expected) {
    return matchThrow(this, 'toThrowError', actual, expected);
  },

  toBeGreaterThan(actual, expected) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      throw new TypeError('toBeGreaterThan expects two numbers.');
    }

    return {
      pass: actual > expected,
      message: (): string =>
        assertionMessage(this, 'toBeGreaterThan', actual, expected, {
          expectedLabel: comparisonLabel(this, '>', expected),
        }),
    };
  },

  toBeLessThan(actual, expected) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      throw new TypeError('toBeLessThan expects two numbers.');
    }

    return {
      pass: actual < expected,
      message: (): string =>
        assertionMessage(this, 'toBeLessThan', actual, expected, {
          expectedLabel: comparisonLabel(this, '<', expected),
        }),
    };
  },

  toBeGreaterThanOrEqual(actual, expected) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      throw new TypeError('toBeGreaterThanOrEqual expects two numbers.');
    }

    return {
      pass: actual >= expected,
      message: (): string =>
        assertionMessage(this, 'toBeGreaterThanOrEqual', actual, expected, {
          expectedLabel: comparisonLabel(this, '>=', expected),
        }),
    };
  },

  toBeLessThanOrEqual(actual, expected) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      throw new TypeError('toBeLessThanOrEqual expects two numbers.');
    }

    return {
      pass: actual <= expected,
      message: (): string =>
        assertionMessage(this, 'toBeLessThanOrEqual', actual, expected, {
          expectedLabel: comparisonLabel(this, '<=', expected),
        }),
    };
  },

  toMatchObject(actual, expected) {
    return {
      pass: matchesObjectShape(actual, expected),
      message: (): string =>
        assertionMessage(this, 'toMatchObject', actual, expected, {
          detail: this.utils.diff(expected, actual),
        }),
    };
  },

  toHaveProperty(actual, ...expected) {
    if (expected.length === 0) {
      throw new TypeError(
        'toHaveProperty expects a property path and an optional value.',
      );
    }

    const path = toPropertyPath(expected[0]);
    const result = readPropertyPath(actual, path);
    const receivedPath = path.map((segment) => String(segment)).join('.');
    const pass =
      result.found &&
      (expected.length < 2 || deepEqual(result.value, expected[1]));

    return {
      pass,
      message: (): string => {
        const lines = [signature(this, 'toHaveProperty', true), ''];

        if (!result.found) {
          lines.push(`Expected path: ${receivedPath}`);
          lines.push('Received: the property path does not exist.');
          return lines.join('\n');
        }

        if (expected.length > 1) {
          lines.push(
            `Expected value at ${receivedPath}: ${this.isNot ? 'not ' : ''}${this.utils.printExpected(expected[1])}`,
          );
          lines.push(
            `Received value: ${this.utils.printReceived(result.value)}`,
          );
          return lines.join('\n');
        }

        lines.push(
          this.isNot
            ? `Expected the property path ${receivedPath} not to exist.`
            : `Expected the property path ${receivedPath} to exist.`,
        );
        lines.push(`Received value: ${this.utils.printReceived(result.value)}`);
        return lines.join('\n');
      },
    };
  },

  toBeCloseTo(actual, expected, digits = 2) {
    if (typeof expected !== 'number') {
      throw new TypeError('toBeCloseTo expects a number.');
    }

    if (typeof digits !== 'number' || !Number.isInteger(digits) || digits < 0) {
      throw new TypeError(
        'toBeCloseTo expects a non-negative integer precision.',
      );
    }

    return {
      pass: isCloseTo(actual, expected, digits),
      message: (): string =>
        assertionMessage(this, 'toBeCloseTo', actual, expected, {
          expectedLabel: `${this.isNot ? 'not ' : ''}${expected} (±${10 ** -digits / 2})`,
        }),
    };
  },

  toHaveBeenCalled(actual) {
    const mock = requireMock(actual, 'toHaveBeenCalled');
    const callCount = mock.mock.calls.length;

    return {
      pass: callCount > 0,
      message: (): string =>
        [
          signature(this, 'toHaveBeenCalled', false),
          '',
          this.isNot
            ? `Expected mock function not to have been called, but it was called ${callCount} time(s).`
            : 'Expected mock function to have been called.',
          `Received: ${callCount} call(s).`,
        ].join('\n'),
    };
  },

  toHaveBeenCalledTimes(actual, expected) {
    const mock = requireMock(actual, 'toHaveBeenCalledTimes');

    if (
      typeof expected !== 'number' ||
      !Number.isInteger(expected) ||
      expected < 0
    ) {
      throw new TypeError(
        'toHaveBeenCalledTimes expects a non-negative integer.',
      );
    }

    const callCount = mock.mock.calls.length;

    return {
      pass: callCount === expected,
      message: (): string =>
        [
          signature(this, 'toHaveBeenCalledTimes', true),
          '',
          `Expected number of calls: ${this.isNot ? `not ${expected}` : expected}`,
          `Received number of calls: ${callCount}`,
        ].join('\n'),
    };
  },

  toHaveBeenCalledWith(actual, ...expected) {
    const mock = requireMock(actual, 'toHaveBeenCalledWith');
    const pass = mock.mock.calls.some((call) => deepEqual(call, expected));

    return {
      pass,
      message: (): string =>
        [
          signature(this, 'toHaveBeenCalledWith', true),
          '',
          `Expected: ${this.isNot ? 'not ' : ''}${this.utils.printExpected(expected)}`,
          formatCalls(this, mock),
        ].join('\n'),
    };
  },

  toHaveBeenLastCalledWith(actual, ...expected) {
    const mock = requireMock(actual, 'toHaveBeenLastCalledWith');
    const lastCall = mock.mock.lastCall;
    const pass = lastCall !== undefined && deepEqual(lastCall, expected);

    return {
      pass,
      message: (): string =>
        [
          signature(this, 'toHaveBeenLastCalledWith', true),
          '',
          `Expected: ${this.isNot ? 'not ' : ''}${this.utils.printExpected(expected)}`,
          lastCall === undefined
            ? 'Received: the mock function was never called.'
            : `Received last call: ${this.utils.printReceived(lastCall)}`,
        ].join('\n'),
    };
  },

  toHaveBeenNthCalledWith(actual, ...expected) {
    const mock = requireMock(actual, 'toHaveBeenNthCalledWith');
    const callIndex = expected[0];

    if (
      typeof callIndex !== 'number' ||
      !Number.isInteger(callIndex) ||
      callIndex < 1
    ) {
      throw new TypeError(
        'toHaveBeenNthCalledWith expects a positive integer call index.',
      );
    }

    const call = mock.mock.calls[callIndex - 1];
    const args = expected.slice(1);
    const pass = call !== undefined && deepEqual(call, args);

    return {
      pass,
      message: (): string =>
        [
          signature(this, 'toHaveBeenNthCalledWith', true),
          '',
          `Expected call ${callIndex}: ${this.isNot ? 'not ' : ''}${this.utils.printExpected(args)}`,
          call === undefined
            ? `Received: the mock function was called ${mock.mock.calls.length} time(s).`
            : `Received call ${callIndex}: ${this.utils.printReceived(call)}`,
        ].join('\n'),
    };
  },

  toHaveReturned(actual) {
    const mock = requireMock(actual, 'toHaveReturned');
    const values = returnValues(mock);
    const pass = values.length > 0;

    return {
      pass,
      message: (): string =>
        [
          signature(this, 'toHaveReturned', false),
          '',
          this.isNot
            ? `Expected mock function not to have returned, but it returned ${values.length} time(s).`
            : 'Expected mock function to have returned.',
          values.length === 0
            ? 'Received: the mock function never returned.'
            : `Received returns: ${this.utils.printReceived(values)}`,
        ].join('\n'),
    };
  },

  toHaveReturnedWith(actual, expected) {
    const mock = requireMock(actual, 'toHaveReturnedWith');
    const values = returnValues(mock);
    const pass = values.some((value) => deepEqual(value, expected));

    return {
      pass,
      message: (): string =>
        [
          signature(this, 'toHaveReturnedWith', true),
          '',
          `Expected: ${this.isNot ? 'not ' : ''}${this.utils.printExpected(expected)}`,
          values.length === 0
            ? 'Received: the mock function never returned.'
            : `Received returns: ${this.utils.printReceived(values)}`,
        ].join('\n'),
    };
  },

  toHaveReturnedTimes(actual, expected) {
    const mock = requireMock(actual, 'toHaveReturnedTimes');

    if (
      typeof expected !== 'number' ||
      !Number.isInteger(expected) ||
      expected < 0
    ) {
      throw new TypeError(
        'toHaveReturnedTimes expects a non-negative integer.',
      );
    }

    const count = returnValues(mock).length;

    return {
      pass: count === expected,
      message: (): string =>
        [
          signature(this, 'toHaveReturnedTimes', true),
          '',
          `Expected number of returns: ${this.isNot ? `not ${expected}` : expected}`,
          `Received number of returns: ${count}`,
        ].join('\n'),
    };
  },
};
