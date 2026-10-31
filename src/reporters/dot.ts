import { formatHookError, formatResultError, formatSummary } from './format.js';
import type {
  FileReport,
  Reporter,
  ReporterIO,
  RunReport,
} from './types.js';

const symbols = {
  passed: '.',
  failed: 'F',
  skipped: 'S',
  todo: 'T',
} as const;

export function createDotReporter(io: ReporterIO): Reporter {
  return {
    onTestResult(result): void {
      io.stdout(symbols[result.status]);
    },
    onHookError(error): void {
      io.stdout('H');
      io.stdout('\n');
      io.stdout(formatHookError(error));
    },
    onFileFinish(_report: FileReport): void {
      io.stdout('\n');
    },
    onRunFinish(report: RunReport): void {
      const failed = report.files.flatMap((file) =>
        file.results.filter((result) => result.status === 'failed'),
      );

      if (failed.length > 0) {
        io.stdout('\nFailures:\n');
        for (const result of failed) {
          io.stdout(`✗ ${result.fullName}\n${formatResultError(result.error)}\n`);
        }
      }

      io.stdout(`\n${formatSummary(report.summary, report.duration)}`);
    },
  };
}
