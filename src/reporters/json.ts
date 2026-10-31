import type { SerializedError } from '../runner/serialize.js';
import { serializeError } from '../runner/serialize.js';
import type { HookType, TestStatus } from '../runner/types.js';
import type {
  FileReport,
  Reporter,
  ReporterIO,
  RunReport,
} from './types.js';

interface JsonTestResult {
  readonly name: string;
  readonly fullName: string;
  readonly status: TestStatus;
  readonly duration: number;
  readonly error: SerializedError | null;
}

interface JsonHookError {
  readonly type: HookType;
  readonly suite: string;
  readonly error: SerializedError;
}

interface JsonFileReport {
  readonly file: string;
  summary: RunReport['summary'];
  duration: number;
  success: boolean;
  readonly results: JsonTestResult[];
  readonly errors: JsonHookError[];
}

export function createJsonReporter(io: ReporterIO): Reporter {
  let current: JsonFileReport | undefined;
  const files: JsonFileReport[] = [];

  return {
    onFileStart(display: string): void {
      current = {
        file: display,
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          todo: 0,
        },
        duration: 0,
        success: true,
        results: [],
        errors: [],
      };
    },
    onTestResult(result): void {
      if (current === undefined) {
        return;
      }

      current.results.push({
        name: result.name,
        fullName: result.fullName,
        status: result.status,
        duration: result.duration,
        error:
          result.error === undefined ? null : serializeError(result.error),
      });
    },
    onHookError(error): void {
      if (current === undefined) {
        return;
      }

      current.errors.push({
        type: error.type,
        suite: error.suite,
        error: serializeError(error.error),
      });
    },
    onFileFinish(report: FileReport): void {
      if (current === undefined) {
        return;
      }

      current.summary = report.summary;
      current.duration = report.duration;
      current.success = report.success;
      files.push(current);
      current = undefined;
    },
    onRunFinish(report: RunReport): void {
      io.stdout(
        `${JSON.stringify(
          {
            success: report.success,
            duration: report.duration,
            summary: report.summary,
            files,
          },
          null,
          2,
        )}\n`,
      );
    },
  };
}
