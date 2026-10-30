import type {
  CoverageReporterName,
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

export const defaultConfig: Readonly<GuchhoConfig> = Object.freeze({
  include: [...defaultInclude],
  exclude: [...defaultExclude],
  timeout: defaultTimeout,
  reporters: ['default'] as ReporterEntry[],
  coverage: Object.freeze({
    enabled: false,
    provider: 'v8',
    reporter: ['text', 'html'] as CoverageReporterName[],
  }),
});
