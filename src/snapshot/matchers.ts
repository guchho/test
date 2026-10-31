import { formatDiff } from '../expect/diff.js';
import type {
  Matcher,
  MatcherContext,
} from '../expect/types.js';
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

export const snapshotMatchers: Record<string, Matcher> = {
  toMatchSnapshot(actual, hint) {
    if (hint !== undefined && typeof hint !== 'string') {
      throw new TypeError('toMatchSnapshot expects an optional string hint.');
    }

    const key = nextSnapshotKey(hint);
    const received = serializeSnapshot(actual);
    const expected = readSnapshot(key);

    if (this.isNot) {
      return {
        pass: expected !== received,
        message: (): string =>
          [
            signature(this, 'toMatchSnapshot', true),
            '',
            `Snapshot name: ${key}`,
            `Expected snapshot not to match: ${received}`,
          ].join('\n'),
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
        mismatchMessage(
          this,
          'toMatchSnapshot',
          key,
          received,
          expected,
        ),
    };
  },

  toMatchInlineSnapshot(actual, expected) {
    if (expected !== undefined && typeof expected !== 'string') {
      throw new TypeError(
        'toMatchInlineSnapshot expects an inline snapshot string.',
      );
    }

    const received = serializeSnapshot(actual);

    if (snapshotsAreUpdating() && !this.isNot) {
      updateInlineSnapshot(snapshotTestFile(), received);
      return { pass: true, message: (): string => '' };
    }

    if (this.isNot) {
      return {
        pass: expected !== received,
        message: (): string =>
          [
            signature(this, 'toMatchInlineSnapshot', true),
            '',
            `Expected inline snapshot not to match: ${received}`,
          ].join('\n'),
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
