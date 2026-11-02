import type {
  CoverageReporterName,
  EnvironmentName,
  GuchhoConfig,
  ReporterEntry,
} from './types.js';

export const defaultInclude = Object.freeze([
  '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
]);

export const defaultExclude = Object.freeze([
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
]);

export const defaultTimeout = 5000;

export const defaultEnvironment: EnvironmentName = 'node';

export const defaultCoverageInclude = Object.freeze([
  '**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
]);

export const defaultCoverageExclude = Object.freeze([
  '**/node_modules/**',
  '**/dist/**',
  '**/tests/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__snapshots__/**',
  '**/coverage/**',
]);

export const defaultConfig: Readonly<GuchhoConfig> = Object.freeze({
  include: [...defaultInclude],
  exclude: [...defaultExclude],
  timeout: defaultTimeout,
  reporters: ['default'] as ReporterEntry[],
  environment: defaultEnvironment,
  environmentOptions: Object.freeze({}),
  globals: false,
  coverage: Object.freeze({
    enabled: false,
    provider: 'v8',
    reporter: ['text', 'html'] as CoverageReporterName[],
    include: [...defaultCoverageInclude],
    exclude: [...defaultCoverageExclude],
    reportsDirectory: 'coverage',
  }),
});
