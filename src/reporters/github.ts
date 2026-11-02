import { formatError } from '../runner/errors.js';
import type { HookError } from '../runner/types.js';
import type { Reporter, ReporterIO } from './types.js';

function escapeData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function annotation(
  level: 'error' | 'warning',
  display: string,
  title: string,
  message: string,
): string {
  return (
    `::${level} file=${escapeProperty(display)},` +
    `title=${escapeProperty(title)}::${escapeData(message)}\n`
  );
}

function hookTitle(error: HookError): string {
  return `${error.type} hook (${error.suite})`;
}

export function createGitHubReporter(io: ReporterIO): Reporter {
  return {
    onTestResult(result, display): void {
      if (result.status !== 'failed') {
        return;
      }

      io.stdout(
        annotation(
          'error',
          display,
          result.fullName,
          formatError(result.error),
        ),
      );
    },
    onHookError(error, display): void {
      io.stdout(
        annotation(
          'error',
          display,
          hookTitle(error),
          formatError(error.error),
        ),
      );
    },
  };
}
