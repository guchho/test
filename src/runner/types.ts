export type TestMode = 'normal' | 'skip' | 'only' | 'todo';

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'todo';

export type TestFunction = () => void | Promise<unknown>;

export type HookType = 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach';

export type HookFunction = () => void | Promise<unknown>;

export interface SuiteHooks {
  readonly beforeAll: HookFunction[];
  readonly afterAll: HookFunction[];
  readonly beforeEach: HookFunction[];
  readonly afterEach: HookFunction[];
}

export interface TestDefinition {
  readonly kind: 'test';
  readonly name: string;
  readonly fullName: string;
  readonly fn: TestFunction | undefined;
  readonly mode: TestMode;
  readonly timeout: number | undefined;
}

export interface SuiteDefinition {
  readonly kind: 'suite';
  readonly name: string;
  readonly fullName: string;
  readonly mode: Exclude<TestMode, 'todo'>;
  readonly parent: SuiteDefinition | undefined;
  readonly items: SuiteItem[];
  readonly hooks: SuiteHooks;
}

export type SuiteItem = TestDefinition | SuiteDefinition;

export interface TestResult {
  readonly name: string;
  readonly fullName: string;
  readonly status: TestStatus;
  readonly duration: number;
  readonly error: unknown;
}

export interface RunSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly todo: number;
}

export interface RunResult {
  readonly results: TestResult[];
  readonly summary: RunSummary;
  readonly errors: HookError[];
  readonly duration: number;
  readonly success: boolean;
}

export interface HookError {
  readonly type: HookType;
  readonly suite: string;
  readonly error: unknown;
}

export interface RunOptions {
  readonly timeout?: number | undefined;
  readonly filter?: string | undefined;
  readonly onResult?: ((result: TestResult) => void) | undefined;
}
