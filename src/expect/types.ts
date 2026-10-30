export interface MatcherResult {
  readonly pass: boolean;
  readonly message: () => string;
}

export interface MatcherUtils {
  stringify(value: unknown): string;
  printReceived(value: unknown): string;
  printExpected(value: unknown): string;
  diff(expected: unknown, received: unknown): string;
}

export type MatcherMode = 'sync' | 'resolves' | 'rejects';

export interface MatcherContext {
  readonly isNot: boolean;
  readonly mode: MatcherMode;
  equals(actual: unknown, expected: unknown, strict?: boolean): boolean;
  readonly utils: MatcherUtils;
}

export type Matcher = (
  this: MatcherContext,
  actual: unknown,
  ...expected: unknown[]
) => MatcherResult | Promise<MatcherResult>;

export type EqualityTest = (
  actual: unknown,
  expected: unknown,
  equals: (actual: unknown, expected: unknown) => boolean,
) => boolean | undefined;
