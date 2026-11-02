import {
  formatDuration,
  formatHookError,
  formatResultError,
  formatSummary,
} from './format.js';
import type { FileReport, Reporter, ReporterIO, RunReport } from './types.js';

const statusLabels = {
  passed: 'PASS',
  failed: 'FAIL',
  skipped: 'SKIP',
  todo: 'TODO',
} as const;

function statusLabel(status: keyof typeof statusLabels): string {
  return statusLabels[status];
}

export function createVerboseReporter(io: ReporterIO): Reporter {
  let fileCount = 0;

  return {
    onRunStart(count: number): void {
      fileCount = count;
    },
    onFileStart(display: string): void {
      io.stdout(`\n${display}\n`);
    },
    onTestResult(result): void {
      io.stdout(
        `${statusLabel(result.status).padEnd(8)} ${result.fullName} ` +
          `(${formatDuration(result.duration)})\n`,
      );

      if (result.status === 'failed') {
        io.stdout(`${formatResultError(result.error)}\n`);
      }
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
