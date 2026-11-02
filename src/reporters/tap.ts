import { formatError } from '../runner/errors.js';
import type { HookError, TestResult } from '../runner/types.js';
import type { Reporter, ReporterIO, RunReport } from './types.js';

function diagnostic(message: string, display: string): string {
  return [
    '  ---',
    `  message: ${JSON.stringify(message)}`,
    `  severity: fail`,
    `  at: ${JSON.stringify(display)}`,
    '  ...',
  ].join('\n');
}

function testLine(index: number, result: TestResult, display: string): string {
  if (result.status === 'failed') {
    return [
      `not ok ${index} - ${result.fullName}`,
      diagnostic(formatError(result.error), display),
    ].join('\n');
  }

  const directive =
    result.status === 'skipped'
      ? ' # SKIP'
      : result.status === 'todo'
        ? ' # TODO'
        : '';
  return `ok ${index} - ${result.fullName}${directive}`;
}

function hookLine(index: number, error: HookError, display: string): string {
  const name = `${error.type} hook (${error.suite})`;
  return [
    `not ok ${index} - ${name}`,
    diagnostic(formatError(error.error), display),
  ].join('\n');
}

export function createTapReporter(io: ReporterIO): Reporter {
  let count = 0;
  let passed = 0;
  let failed = 0;

  return {
    onRunStart(): void {
      io.stdout('TAP version 13\n');
    },
    onTestResult(result, display): void {
      count += 1;
      if (result.status === 'failed') {
        failed += 1;
      } else {
        passed += 1;
      }

      io.stdout(`${testLine(count, result, display)}\n`);
    },
    onHookError(error, display): void {
      count += 1;
      failed += 1;
      io.stdout(`${hookLine(count, error, display)}\n`);
    },
    onRunFinish(_report: RunReport): void {
      io.stdout(`1..${count}\n`);
      io.stdout(`# tests ${count}\n`);
      io.stdout(`# pass ${passed}\n`);
      io.stdout(`# fail ${failed}\n`);
    },
  };
}
