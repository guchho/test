import type {
  HookError,
  RunSummary,
  TestResult,
} from '../runner/types.js';

export interface ReporterIO {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface FileReport {
  readonly display: string;
  readonly results: readonly TestResult[];
  readonly errors: readonly HookError[];
  readonly summary: RunSummary;
  readonly duration: number;
  readonly success: boolean;
}

export interface RunReport {
  readonly files: readonly FileReport[];
  readonly summary: RunSummary;
  readonly duration: number;
  readonly success: boolean;
}

export interface Reporter {
  onRunStart?(fileCount: number): void;
  onFileStart?(display: string): void;
  onTestResult?(result: TestResult, display: string): void;
  onHookError?(error: HookError, display: string): void;
  onFileFinish?(report: FileReport): void;
  onRunFinish?(report: RunReport): void;
}
