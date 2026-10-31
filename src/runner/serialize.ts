import { inspect } from 'node:util';

import type { CoveragePayload } from '../coverage/types.js';

import type {
  HookError,
  HookType,
  RunResult,
  RunSummary,
  TestResult,
  TestStatus,
} from './types.js';

export interface SerializedError {
  readonly isError: boolean;
  readonly name: string;
  readonly message: string;
  readonly stack: string | undefined;
  readonly inspected: string;
}

export interface SerializedTestResult {
  readonly name: string;
  readonly fullName: string;
  readonly status: TestStatus;
  readonly duration: number;
  readonly error: SerializedError | undefined;
}

export interface SerializedHookError {
  readonly type: HookType;
  readonly suite: string;
  readonly error: SerializedError;
}

export interface SerializedRunResult {
  readonly results: readonly SerializedTestResult[];
  readonly summary: RunSummary;
  readonly errors: readonly SerializedHookError[];
  readonly duration: number;
  readonly success: boolean;
  readonly testCount: number;
}

export interface WorkerInput {
  readonly file: string;
  readonly timeout: number;
  readonly filter: string | undefined;
  readonly testNamePattern: { readonly source: string; readonly flags: string } | undefined;
  readonly bail: boolean;
  readonly updateSnapshots: boolean;
  readonly coverage: boolean;
}

export type WorkerOutcome = (
  | { readonly kind: 'result'; readonly file: string; readonly result: SerializedRunResult }
  | { readonly kind: 'load-error'; readonly file: string; readonly error: SerializedError }
  | { readonly kind: 'failure'; readonly file: string; readonly message: string }
) & { readonly coverage?: CoveragePayload };

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      isError: true,
      name: error.name,
      message: error.message,
      stack: error.stack,
      inspected: inspect(error),
    };
  }

  return {
    isError: false,
    name: 'ThrownValue',
    message: inspect(error),
    stack: undefined,
    inspected: inspect(error),
  };
}

export function deserializeError(error: SerializedError): unknown {
  if (!error.isError) {
    return new InspectedValue(error.inspected);
  }

  const restored = new Error(error.message);
  restored.name = error.name;
  if (error.stack !== undefined) {
    restored.stack = error.stack;
  }

  return restored;
}

export class InspectedValue {
  constructor(readonly inspected: string) {}
}

function serializeResult(result: TestResult): SerializedTestResult {
  return {
    name: result.name,
    fullName: result.fullName,
    status: result.status,
    duration: result.duration,
    error:
      result.error === undefined ? undefined : serializeError(result.error),
  };
}

function serializeHookError(error: HookError): SerializedHookError {
  return {
    type: error.type,
    suite: error.suite,
    error: serializeError(error.error),
  };
}

export function serializeRunResult(
  result: RunResult,
  testCount: number,
): SerializedRunResult {
  return {
    results: result.results.map(serializeResult),
    summary: result.summary,
    errors: result.errors.map(serializeHookError),
    duration: result.duration,
    success: result.success,
    testCount,
  };
}

export function deserializeRunResult(result: SerializedRunResult): RunResult {
  return {
    results: result.results.map(
      (entry): TestResult => ({
        name: entry.name,
        fullName: entry.fullName,
        status: entry.status,
        duration: entry.duration,
        error:
          entry.error === undefined ? undefined : deserializeError(entry.error),
      }),
    ),
    summary: result.summary,
    errors: result.errors.map(
      (entry): HookError => ({
        type: entry.type,
        suite: entry.suite,
        error: deserializeError(entry.error),
      }),
    ),
    duration: result.duration,
    success: result.success,
  };
}
