import { isAsymmetricMatcher } from './asymmetric.js';
import type { EqualityTest } from './types.js';

type SeenPairs = WeakMap<object, WeakSet<object>>;

const equalityTests: EqualityTest[] = [];

export function addEqualityTest(test: EqualityTest): () => void {
  if (typeof test !== 'function') {
    throw new TypeError('A custom equality test must be a function.');
  }

  equalityTests.push(test);

  return (): void => {
    const index = equalityTests.indexOf(test);
    if (index !== -1) {
      equalityTests.splice(index, 1);
    }
  };
}

function tagOf(value: object): string {
  return Object.prototype.toString.call(value);
}

function withSeen(
  actual: object,
  expected: object,
  seen: SeenPairs,
  compare: () => boolean,
): boolean {
  let expectedValues = seen.get(actual);

  if (expectedValues === undefined) {
    expectedValues = new WeakSet<object>();
    seen.set(actual, expectedValues);
  }

  if (expectedValues.has(expected)) {
    return true;
  }

  expectedValues.add(expected);

  try {
    return compare();
  } finally {
    expectedValues.delete(expected);
  }
}

function enumerableKeys(value: object, strict: boolean): (string | symbol)[] {
  const keys = Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  );

  if (strict) {
    return keys;
  }

  return keys.filter(
    (key) => (value as Record<string | symbol, unknown>)[key] !== undefined,
  );
}

function compareKeys(
  actual: object,
  expected: object,
  strict: boolean,
  seen: SeenPairs,
): boolean {
  const actualKeys = enumerableKeys(actual, strict);
  const expectedKeys = enumerableKeys(expected, strict);

  if (actualKeys.length !== expectedKeys.length) {
    return false;
  }

  for (const key of actualKeys) {
    if (!expectedKeys.includes(key)) {
      return false;
    }
  }

  for (const key of actualKeys) {
    const actualValue = (actual as Record<string | symbol, unknown>)[key];
    const expectedValue = (expected as Record<string | symbol, unknown>)[key];

    if (!equalsInternal(actualValue, expectedValue, strict, seen)) {
      return false;
    }
  }

  return true;
}

function compareBytes(actual: Uint8Array, expected: Uint8Array): boolean {
  if (actual.byteLength !== expected.byteLength) {
    return false;
  }

  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      return false;
    }
  }

  return true;
}

function compareViews(
  actual: ArrayBufferView,
  expected: ArrayBufferView,
): boolean {
  if (Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)) {
    return false;
  }

  return compareBytes(
    new Uint8Array(actual.buffer, actual.byteOffset, actual.byteLength),
    new Uint8Array(expected.buffer, expected.byteOffset, expected.byteLength),
  );
}

function compareMaps(
  actual: Map<unknown, unknown>,
  expected: Map<unknown, unknown>,
  strict: boolean,
  seen: SeenPairs,
): boolean {
  if (actual.size !== expected.size) {
    return false;
  }

  const expectedEntries = [...expected.entries()];
  const used = new Array<boolean>(expectedEntries.length).fill(false);

  for (const [actualKey, actualValue] of actual.entries()) {
    let matched = false;

    for (let index = 0; index < expectedEntries.length; index += 1) {
      if (used[index] === true) {
        continue;
      }

      const entry = expectedEntries[index];
      if (entry === undefined) {
        continue;
      }

      const [expectedKey, expectedValue] = entry;
      if (
        equalsInternal(actualKey, expectedKey, strict, seen) &&
        equalsInternal(actualValue, expectedValue, strict, seen)
      ) {
        used[index] = true;
        matched = true;
        break;
      }
    }

    if (!matched) {
      return false;
    }
  }

  return true;
}

function compareSets(
  actual: Set<unknown>,
  expected: Set<unknown>,
  strict: boolean,
  seen: SeenPairs,
): boolean {
  if (actual.size !== expected.size) {
    return false;
  }

  const expectedValues = [...expected.values()];
  const used = new Array<boolean>(expectedValues.length).fill(false);

  for (const actualValue of actual.values()) {
    let matched = false;

    for (let index = 0; index < expectedValues.length; index += 1) {
      if (
        used[index] !== true &&
        equalsInternal(actualValue, expectedValues[index], strict, seen)
      ) {
        used[index] = true;
        matched = true;
        break;
      }
    }

    if (!matched) {
      return false;
    }
  }

  return true;
}

function compareObjects(
  actual: object,
  expected: object,
  strict: boolean,
  seen: SeenPairs,
): boolean {
  if (
    strict &&
    Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)
  ) {
    return false;
  }

  const actualTag = tagOf(actual);
  const expectedTag = tagOf(expected);

  if (actualTag !== expectedTag) {
    return false;
  }

  switch (actualTag) {
    case '[object Date]':
      return Object.is(
        (actual as Date).getTime(),
        (expected as Date).getTime(),
      );
    case '[object RegExp]':
      return (
        (actual as RegExp).source === (expected as RegExp).source &&
        (actual as RegExp).flags === (expected as RegExp).flags
      );
    case '[object Map]':
      return compareMaps(
        actual as Map<unknown, unknown>,
        expected as Map<unknown, unknown>,
        strict,
        seen,
      );
    case '[object Set]':
      return compareSets(
        actual as Set<unknown>,
        expected as Set<unknown>,
        strict,
        seen,
      );
    case '[object ArrayBuffer]':
    case '[object SharedArrayBuffer]':
      return compareBytes(
        new Uint8Array(actual as ArrayBufferLike),
        new Uint8Array(expected as ArrayBufferLike),
      );
    case '[object Number]':
    case '[object String]':
    case '[object Boolean]':
    case '[object BigInt]':
    case '[object Symbol]':
      return Object.is(
        (actual as { valueOf(): unknown }).valueOf(),
        (expected as { valueOf(): unknown }).valueOf(),
      );
    case '[object Error]':
      return (
        (actual as Error).name === (expected as Error).name &&
        (actual as Error).message === (expected as Error).message &&
        compareKeys(actual, expected, strict, seen)
      );
    case '[object WeakMap]':
    case '[object WeakSet]':
    case '[object Promise]':
      return false;
    case '[object Array]':
      return (
        (actual as unknown[]).length === (expected as unknown[]).length &&
        compareKeys(actual, expected, strict, seen)
      );
    default:
      if (ArrayBuffer.isView(actual) || ArrayBuffer.isView(expected)) {
        if (!ArrayBuffer.isView(actual) || !ArrayBuffer.isView(expected)) {
          return false;
        }

        return compareViews(actual, expected);
      }

      return compareKeys(actual, expected, strict, seen);
  }
}

function equalsInternal(
  actual: unknown,
  expected: unknown,
  strict: boolean,
  seen: SeenPairs,
): boolean {
  if (Object.is(actual, expected)) {
    return true;
  }

  if (isAsymmetricMatcher(expected)) {
    return expected.asymmetricMatch(actual, (left, right) =>
      equalsInternal(left, right, strict, seen),
    );
  }

  for (const test of equalityTests) {
    const result = test(actual, expected, (left, right) =>
      equalsInternal(left, right, strict, seen),
    );

    if (result !== undefined) {
      if (typeof result !== 'boolean') {
        throw new TypeError(
          'Custom equality tests must return a boolean or undefined.',
        );
      }

      return result;
    }
  }

  if (typeof actual !== typeof expected) {
    return false;
  }

  if (actual === null || expected === null) {
    return false;
  }

  if (typeof actual === 'function' || typeof expected === 'function') {
    return false;
  }

  if (typeof actual !== 'object' || typeof expected !== 'object') {
    return false;
  }

  return withSeen(actual, expected, seen, () =>
    compareObjects(actual, expected, strict, seen),
  );
}

export function deepEqual(
  actual: unknown,
  expected: unknown,
  strict = false,
): boolean {
  return equalsInternal(actual, expected, strict, new WeakMap());
}
