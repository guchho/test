export type ReporterName =
  | 'default'
  | 'verbose'
  | 'dot'
  | 'json'
  | 'junit'
  | 'tap'
  | 'github'
  | 'github-actions';

export type CoverageReporterName =
  'text' | 'html' | 'json' | 'lcov' | 'cobertura';

export type EnvironmentName = 'node' | 'jsdom' | 'happy-dom';

export interface CoverageThresholds {
  lines?: number;
  functions?: number;
  branches?: number;
  statements?: number;
  perFile?: boolean;
}

export interface CoverageConfig {
  enabled?: boolean;
  provider?: 'v8';
  reporter?: CoverageReporterName[];
  include?: string[];
  exclude?: string[];
  thresholds?: CoverageThresholds;
  reportsDirectory?: string;
}

export type ReporterEntry =
  | ReporterName
  | [ReporterName, Record<string, unknown>]
  | [string, Record<string, unknown>];

export interface GuchhoConfig {
  include?: string[];
  exclude?: string[];
  timeout?: number;
  reporters?: ReporterEntry[];
  plugins?: string[];
  setupFiles?: string[];
  setupFilesAfterEnv?: string[];
  globalSetup?: string;
  globalTeardown?: string;
  environment?: EnvironmentName;
  environmentOptions?: Record<string, unknown>;
  globals?: boolean;
  tsconfig?: string;
  coverage?: CoverageConfig;
}
