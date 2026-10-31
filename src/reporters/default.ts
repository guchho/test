import {
  formatHookError,
  formatSummary,
  resultLine,
} from './format.js';
import type {
  FileReport,
  Reporter,
  ReporterIO,
  RunReport,
} from './types.js';

export function createDefaultReporter(io: ReporterIO): Reporter {
  let fileCount = 0;

  return {
    onRunStart(count: number): void {
      fileCount = count;
    },
    onFileStart(display: string): void {
      io.stdout(`\n${display}\n`);
    },
    onTestResult(result): void {
      io.stdout(resultLine(result));
    },
    onHookError(error): void {
      io.stdout(formatHookError(error));
    },
    onFileFinish(report: FileReport): void {
      if (report.results.length === 0) {
        io.stdout('No tests matched the current filter.\n');
      }

      io.stdout(formatSummary(report.summary, report.duration));
    },
    onRunFinish(report: RunReport): void {
      if (fileCount > 1) {
        io.stdout('\nOverall\n');
        io.stdout(formatSummary(report.summary, report.duration));
      }
    },
  };
}
