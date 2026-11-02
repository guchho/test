import { formatError } from '../runner/errors.js';
import type { HookError, RunSummary, TestResult } from '../runner/types.js';

export function formatDuration(duration: number): string {
  return duration < 1 ? '<1ms' : `${Math.round(duration)}ms`;
}

export function formatSummary(summary: RunSummary, duration: number): string {
  return (
    `Tests: ${summary.passed} passed, ${summary.failed} failed, ` +
    `${summary.skipped} skipped, ${summary.todo} todo ` +
    `(${formatDuration(duration)})\n`
  );
}

export function formatResultError(error: unknown): string {
  return formatError(error)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

export function formatHookError(hookError: HookError): string {
  const error = formatError(hookError.error);
  return (
    `✗ ${hookError.type} hook in "${hookError.suite}" failed\n` +
    `${error
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n')}\n`
  );
}

export function resultLine(result: TestResult): string {
  const duration = formatDuration(result.duration);

  switch (result.status) {
    case 'passed':
      return `✓ ${result.fullName} (${duration})\n`;
    case 'failed':
      return (
        `✗ ${result.fullName} (${duration})\n` +
        `${formatResultError(result.error)}\n`
      );
    case 'skipped':
      return `- ${result.fullName} (skipped)\n`;
    case 'todo':
      return `○ ${result.fullName} (todo)\n`;
  }
}
