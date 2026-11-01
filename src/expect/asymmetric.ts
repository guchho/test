import { inspect } from 'node:util';

export const asymmetricMatcherSymbol: unique symbol = Symbol.for(
  '@guchho/test/asymmetric',
);

export type Equals = (actual: unknown, expected: unknown) => boolean;

export interface AsymmetricMatcher {
  readonly [asymmetricMatcherSymbol]: true;
  asymmetricMatch(actual: unknown, equals: Equals): boolean;
  toString(): string;
}

abstract class BaseAsymmetricMatcher implements AsymmetricMatcher {
  readonly [asymmetricMatcherSymbol] = true as const;

  abstract asymmetricMatch(actual: unknown, equals: Equals): boolean;

  abstract toString(): string;

  [inspect.custom](): string {
    return this.toString();
  }
}

function isObjectLike(value: unknown): value is object {
  return (
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
  );
}

function constructorName(sample: Function): string {
  return sample.name.length > 0 ? sample.name : 'Function';
}

class AnyMatcher extends BaseAsymmetricMatcher {
  constructor(private readonly sample: Function) {
    super();
  }

  override asymmetricMatch(actual: unknown): boolean {
    switch (this.sample) {
      case String:
        return typeof actual === 'string' || actual instanceof String;
      case Number:
        return typeof actual === 'number' || actual instanceof Number;
      case Boolean:
        return typeof actual === 'boolean' || actual instanceof Boolean;
      case BigInt:
        return typeof actual === 'bigint';
      case Symbol:
        return typeof actual === 'symbol';
      case Function:
        return typeof actual === 'function';
      case Object:
        return isObjectLike(actual);
      default:
        return actual instanceof (this.sample as new (...args: unknown[]) => object);
    }
  }

  override toString(): string {
    return `expect.any(${constructorName(this.sample)})`;
  }
}

class AnythingMatcher extends BaseAsymmetricMatcher {
  override asymmetricMatch(actual: unknown): boolean {
    return actual !== null && actual !== undefined;
  }

  override toString(): string {
    return 'expect.anything()';
  }
}

class ObjectContainingMatcher extends BaseAsymmetricMatcher {
  constructor(private readonly sample: Record<PropertyKey, unknown>) {
    super();
  }

  override asymmetricMatch(actual: unknown, equals: Equals): boolean {
    if (!isObjectLike(actual)) {
      return false;
    }

    const record = actual as Record<PropertyKey, unknown>;
    const keys = Reflect.ownKeys(this.sample).filter((key) =>
      Object.prototype.propertyIsEnumerable.call(this.sample, key),
    );

    for (const key of keys) {
      if (!(key in record)) {
        return false;
      }

      if (!equals(record[key], this.sample[key])) {
        return false;
      }
    }

    return true;
  }

  override toString(): string {
    return `expect.objectContaining(${inspect(this.sample, {
      breakLength: Infinity,
      compact: true,
      depth: 3,
    })})`;
  }
}

class ArrayContainingMatcher extends BaseAsymmetricMatcher {
  constructor(private readonly sample: readonly unknown[]) {
    super();
  }

  override asymmetricMatch(actual: unknown, equals: Equals): boolean {
    if (!Array.isArray(actual)) {
      return false;
    }

    const remaining = [...actual];

    for (const expected of this.sample) {
      const index = remaining.findIndex((candidate) =>
        equals(candidate, expected),
      );

      if (index === -1) {
        return false;
      }

      remaining.splice(index, 1);
    }

    return true;
  }

  override toString(): string {
    return `expect.arrayContaining(${inspect(this.sample, {
      breakLength: Infinity,
      compact: true,
      depth: 3,
    })})`;
  }
}

class StringContainingMatcher extends BaseAsymmetricMatcher {
  constructor(private readonly sample: string) {
    super();
  }

  override asymmetricMatch(actual: unknown): boolean {
    return typeof actual === 'string' && actual.includes(this.sample);
  }

  override toString(): string {
    return `expect.stringContaining(${inspect(this.sample)})`;
  }
}

class StringMatchingMatcher extends BaseAsymmetricMatcher {
  private readonly pattern: RegExp;

  constructor(sample: string | RegExp) {
    super();
    this.pattern =
      sample instanceof RegExp ? new RegExp(sample.source, sample.flags) : new RegExp(sample);
  }

  override asymmetricMatch(actual: unknown): boolean {
    if (typeof actual !== 'string') {
      return false;
    }

    this.pattern.lastIndex = 0;
    return this.pattern.test(actual);
  }

  override toString(): string {
    return `expect.stringMatching(${inspect(this.pattern.source)})`;
  }
}

class CloseToMatcher extends BaseAsymmetricMatcher {
  constructor(
    private readonly expected: number,
    private readonly digits: number,
  ) {
    super();
  }

  override asymmetricMatch(actual: unknown): boolean {
    if (typeof actual !== 'number' || Number.isNaN(actual)) {
      return false;
    }

    if (Object.is(actual, this.expected)) {
      return true;
    }

    return Math.abs(actual - this.expected) < 10 ** -this.digits / 2;
  }

  override toString(): string {
    return `expect.closeTo(${this.expected}, ${this.digits})`;
  }
}

export function isAsymmetricMatcher(
  value: unknown,
): value is AsymmetricMatcher {
  if (!isObjectLike(value)) {
    return false;
  }

  const candidate = value as Partial<AsymmetricMatcher>;
  return (
    candidate[asymmetricMatcherSymbol] === true &&
    typeof candidate.asymmetricMatch === 'function'
  );
}

export function any(sample: Function): AsymmetricMatcher {
  if (typeof sample !== 'function') {
    throw new TypeError('expect.any expects a constructor function.');
  }

  return new AnyMatcher(sample);
}

export function anything(): AsymmetricMatcher {
  return new AnythingMatcher();
}

export function objectContaining(
  sample: Record<PropertyKey, unknown>,
): AsymmetricMatcher {
  if (!isObjectLike(sample)) {
    throw new TypeError('expect.objectContaining expects an object.');
  }

  return new ObjectContainingMatcher(sample);
}

export function arrayContaining(
  sample: readonly unknown[],
): AsymmetricMatcher {
  if (!Array.isArray(sample)) {
    throw new TypeError('expect.arrayContaining expects an array.');
  }

  return new ArrayContainingMatcher(sample);
}

export function stringContaining(sample: string): AsymmetricMatcher {
  if (typeof sample !== 'string') {
    throw new TypeError('expect.stringContaining expects a string.');
  }

  return new StringContainingMatcher(sample);
}

export function stringMatching(sample: string | RegExp): AsymmetricMatcher {
  if (typeof sample !== 'string' && !(sample instanceof RegExp)) {
    throw new TypeError(
      'expect.stringMatching expects a string or regular expression.',
    );
  }

  return new StringMatchingMatcher(sample);
}

export function closeTo(expected: number, digits = 2): AsymmetricMatcher {
  if (typeof expected !== 'number' || Number.isNaN(expected)) {
    throw new TypeError('expect.closeTo expects a number.');
  }

  if (!Number.isInteger(digits) || digits < 0) {
    throw new TypeError(
      'expect.closeTo expects a non-negative integer precision.',
    );
  }

  return new CloseToMatcher(expected, digits);
}
