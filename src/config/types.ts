export type ReporterName = 'default' | 'verbose' | 'dot' | 'json' | 'junit';

export type CoverageReporterName = 'text' | 'html' | 'json';

export interface CoverageThresholds {
  lines?: number;
  functions?: number;
  branches?: number;
  statements?: number;
}

export interface CoverageConfig {
  enabled?: boolean;
  provider?: 'v8';
  reporter?: CoverageReporterName[];
  include?: string[];
  exclude?: string[];
  thresholds?: CoverageThresholds;
}

export type ReporterEntry = ReporterName | [ReporterName, Record<string, unknown>];

export interface GuchhoConfig {
  include?: string[];
  exclude?: string[];
  timeout?: number;
  reporters?: ReporterEntry[];
  coverage?: CoverageConfig;
}
