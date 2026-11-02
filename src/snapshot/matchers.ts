import { formatDiff } from '../expect/diff.js';
import { isAsymmetricMatcher } from '../expect/asymmetric.js';
import type { Matcher, MatcherContext } from '../expect/types.js';
import { updateInlineSnapshot } from './inline.js';
import { serializeSnapshot } from './serialize.js';
import {
  nextSnapshotKey,
  readSnapshot,
  snapshotsAreUpdating,
  snapshotFilePath,
  snapshotTestFile,
  writeSnapshot,
} from './session.js';

type PropertyMatchers = Record<PropertyKey, unknown>;

function signature(
  context: MatcherContext,
  name: string,
  hasExpected: boolean,
): string {
  const mode = context.mode === 'sync' ? '' : `${context.mode}.`;
  const negation = context.isNot ? 'not.' : '';
  return `expect(received).${mode}${negation}${name}(${hasExpected ? 'expected' : ''})`;
}

function mismatchMessage(
  context: MatcherContext,
  name: 'toMatchSnapshot' | 'toMatchInlineSnapshot',
  key: string,
  received: string,
  expected: string,
): string {
  return [
    signature(context, name, name === 'toMatchInlineSnapshot'),
    '',
    `Snapshot name: ${key}`,
    '',
    `Expected: ${expected}`,
    `Received: ${received}`,
    '',
    'Difference (- snapshot, + received):',
    formatDiff(expected, received),
  ].join('\n');
}

function missingMessage(
  context: MatcherContext,
  name: 'toMatchSnapshot' | 'toMatchInlineSnapshot',
  key: string,
  received: string,
  file: string,
  hint: string,
): string {
  return [
    signature(context, name, name === 'toMatchInlineSnapshot'),
    '',
    `Snapshot "${key}" does not exist in ${file}.`,
    `Received: ${received}`,
    '',
    hint,
  ].join('\n');
}

function propertyMismatchMessage(
  context: MatcherContext,
  name: 'toMatchSnapshot' | 'toMatchInlineSnapshot',
  failures: readonly string[],
): string {
  return [
    signature(context, name, true),
    '',
    'Snapshot property matchers did not match:',
    ...failures.map((failure) => `  ${failure}`),
  ].join('\n');
}

function placeholderFor(value: unknown): string {
  if (!isAsymmetricMatcher(value)) {
    return 'Any<Value>';
  }

  const text = value.toString();

  if (text.startsWith('expect.any(')) {
    return `Any<${text.slice('expect.any('.length, -1)}>`;
  }

  if (text.startsWith('expect.anything(')) {
    return 'Any<Anything>';
  }

  if (text.startsWith('expect.objectContaining(')) {
    return 'Any<Object>';
  }

  if (text.startsWith('expect.arrayContaining(')) {
    return 'Any<Array>';
  }

  if (
    text.startsWith('expect.stringContaining(') ||
    text.startsWith('expect.stringMatching(')
  ) {
    return 'Any<String>';
  }

  if (text.startsWith('expect.closeTo(')) {
    return 'Any<Number>';
  }

  return 'Any<Matcher>';
}

function cloneWithPlaceholders(
  actual: object,
  properties: PropertyMatchers,
): object {
  const clone: Record<PropertyKey, unknown> = Array.isArray(actual)
    ? [...actual]
    : Object.assign(
        Object.create(Object.getPrototypeOf(actual) as object | null),
        actual,
      );

  for (const key of Reflect.ownKeys(properties)) {
    if (!Object.prototype.propertyIsEnumerable.call(properties, key)) {
      continue;
    }

    clone[key] = placeholderFor(properties[key]);
  }

  return clone;
}

interface PropertyMatchResult {
  readonly pass: boolean;
  readonly serialized: string;
  readonly failures: readonly string[];
}

function matchProperties(
  context: MatcherContext,
  actual: unknown,
  properties: PropertyMatchers,
): PropertyMatchResult {
  if (
    actual === null ||
    (typeof actual !== 'object' && typeof actual !== 'function')
  ) {
    return {
      pass: false,
      serialized: serializeSnapshot(actual),
      failures: [
        'Received value must be an object to apply property matchers.',
      ],
    };
  }

  const record = actual as Record<PropertyKey, unknown>;
  const failures: string[] = [];

  for (const key of Reflect.ownKeys(properties)) {
    if (!Object.prototype.propertyIsEnumerable.call(properties, key)) {
      continue;
    }

    if (!(key in record)) {
      failures.push(`Property "${String(key)}" is missing.`);
      continue;
    }

    const expected = properties[key];
    if (!context.equals(record[key], expected)) {
      failures.push(
        `Property "${String(key)}": expected ${context.utils.printExpected(expected)}, received ${context.utils.printReceived(record[key])}`,
      );
    }
  }

  return {
    pass: failures.length === 0,
    serialized: serializeSnapshot(cloneWithPlaceholders(actual, properties)),
    failures,
  };
}

function readSnapshotArguments(
  name: 'toMatchSnapshot' | 'toMatchInlineSnapshot',
  first: unknown,
  second: unknown,
): {
  readonly properties: PropertyMatchers | undefined;
  readonly argument: string | undefined;
} {
  if (first === undefined) {
    return { properties: undefined, argument: undefined };
  }

  if (typeof first === 'string') {
    return { properties: undefined, argument: first };
  }

  if (first === null || typeof first !== 'object' || Array.isArray(first)) {
    throw new TypeError(
      `${name} expects an optional properties object${
        name === 'toMatchSnapshot' ? ' or string hint' : ' and snapshot string'
      }.`,
    );
  }

  if (second !== undefined && typeof second !== 'string') {
    throw new TypeError(
      name === 'toMatchSnapshot'
        ? 'toMatchSnapshot expects the hint to be a string.'
        : 'toMatchInlineSnapshot expects the snapshot to be a string.',
    );
  }

  return {
    properties: first as PropertyMatchers,
    argument: second,
  };
}

export const snapshotMatchers: Record<string, Matcher> = {
  toMatchSnapshot(actual, ...args) {
    const { properties, argument: hint } = readSnapshotArguments(
      'toMatchSnapshot',
      args[0],
      args[1],
    );

    const key = nextSnapshotKey(hint);
    const propertyMatch =
      properties === undefined
        ? {
            pass: true,
            serialized: serializeSnapshot(actual),
            failures: [] as readonly string[],
          }
        : matchProperties(this, actual, properties);
    const received = propertyMatch.serialized;
    const expected = readSnapshot(key);

    if (this.isNot) {
      return {
        pass: !propertyMatch.pass || expected !== received,
        message: (): string =>
          [
            signature(this, 'toMatchSnapshot', true),
            '',
            `Snapshot name: ${key}`,
            `Expected snapshot not to match: ${received}`,
          ].join('\n'),
      };
    }

    if (!propertyMatch.pass) {
      return {
        pass: false,
        message: (): string =>
          propertyMismatchMessage(
            this,
            'toMatchSnapshot',
            propertyMatch.failures,
          ),
      };
    }

    if (snapshotsAreUpdating()) {
      writeSnapshot(key, received);
      return { pass: true, message: (): string => '' };
    }

    if (expected === undefined) {
      return {
        pass: false,
        message: (): string =>
          missingMessage(
            this,
            'toMatchSnapshot',
            key,
            received,
            snapshotFilePath(),
            'Run with --update to create missing snapshots.',
          ),
      };
    }

    return {
      pass: expected === received,
      message: (): string =>
        mismatchMessage(this, 'toMatchSnapshot', key, received, expected),
    };
  },

  toMatchInlineSnapshot(actual, ...args) {
    const { properties, argument: expected } = readSnapshotArguments(
      'toMatchInlineSnapshot',
      args[0],
      args[1],
    );

    const propertyMatch =
      properties === undefined
        ? {
            pass: true,
            serialized: serializeSnapshot(actual),
            failures: [] as readonly string[],
          }
        : matchProperties(this, actual, properties);
    const received = propertyMatch.serialized;

    if (snapshotsAreUpdating() && !this.isNot) {
      updateInlineSnapshot(
        snapshotTestFile(),
        received,
        properties === undefined ? 0 : 1,
      );
      return { pass: true, message: (): string => '' };
    }

    if (this.isNot) {
      return {
        pass: !propertyMatch.pass || expected !== received,
        message: (): string =>
          [
            signature(this, 'toMatchInlineSnapshot', true),
            '',
            `Expected inline snapshot not to match: ${received}`,
          ].join('\n'),
      };
    }

    if (!propertyMatch.pass) {
      return {
        pass: false,
        message: (): string =>
          propertyMismatchMessage(
            this,
            'toMatchInlineSnapshot',
            propertyMatch.failures,
          ),
      };
    }

    if (expected === undefined) {
      return {
        pass: false,
        message: (): string =>
          missingMessage(
            this,
            'toMatchInlineSnapshot',
            '<inline>',
            received,
            snapshotTestFile(),
            'Run with --update to write the inline snapshot.',
          ),
      };
    }

    return {
      pass: expected === received,
      message: (): string =>
        mismatchMessage(
          this,
          'toMatchInlineSnapshot',
          '<inline>',
          received,
          expected,
        ),
    };
  },
};
