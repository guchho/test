import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { defaultConfig, defaultTimeout } from './defaults.js';
import type {
  CoverageConfig,
  CoverageReporterName,
  GuchhoConfig,
  ReporterEntry,
  ReporterName,
} from './types.js';

const configFileNames = [
  'guchho.test.config.ts',
  'guchho.test.config.js',
  'guchho.test.config.mjs',
  'guchho.test.config.json',
] as const;

const configExtensions = new Set(['.ts', '.js', '.mjs', '.json']);

const reporterNames = new Set<ReporterName>([
  'default',
  'verbose',
  'dot',
  'json',
  'junit',
]);

const coverageReporterNames = new Set<CoverageReporterName>([
  'text',
  'html',
  'json',
]);

const knownConfigKeys = new Set([
  'include',
  'exclude',
  'timeout',
  'reporters',
  'plugins',
  'coverage',
]);

const knownCoverageKeys = new Set([
  'enabled',
  'provider',
  'reporter',
  'include',
  'exclude',
  'thresholds',
  'reportsDirectory',
]);

const knownThresholdKeys = new Set([
  'lines',
  'functions',
  'branches',
  'statements',
]);

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export interface LoadedConfig {
  readonly config: GuchhoConfig;
  readonly path: string;
}

export interface ResolvedConfig {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly timeout: number;
  readonly reporters: readonly ReporterEntry[];
  readonly plugins: readonly string[];
  readonly coverage: Readonly<CoverageConfig>;
}

export interface ConfigOverrides {
  readonly timeout?: number | undefined;
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function assertObject(
  value: unknown,
  source: string,
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${source}: ${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function validateStringArray(
  value: unknown,
  source: string,
  key: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new ConfigError(`${source}: "${key}" must be an array of strings.`);
  }

  return value.map((entry) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new ConfigError(
        `${source}: "${key}" must only contain non-empty strings.`,
      );
    }

    return entry;
  });
}

function validateTimeout(value: unknown, source: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new ConfigError(
      `${source}: "timeout" must be a positive, finite number.`,
    );
  }

  return value;
}

function validateReporters(
  value: unknown,
  source: string,
  allowCustom: boolean,
): ReporterEntry[] {
  if (!Array.isArray(value)) {
    throw new ConfigError(`${source}: "reporters" must be an array.`);
  }

  return value.map((entry) => {
    if (typeof entry === 'string') {
      if (!allowCustom && !reporterNames.has(entry as ReporterName)) {
        throw new ConfigError(
          `${source}: unknown reporter "${entry}".`,
        );
      }

      return entry as ReporterName;
    }

    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new ConfigError(
        `${source}: reporter entries must be a name or [name, options].`,
      );
    }

    const [name, options] = entry;
    if (
      typeof name !== 'string' ||
      (!allowCustom && !reporterNames.has(name as ReporterName)) ||
      name.trim().length === 0
    ) {
      throw new ConfigError(
        `${source}: unknown reporter "${String(name)}".`,
      );
    }

    assertObject(options, source, `reporter "${name}" options`);

    return [name, options as Record<string, unknown>];
  });
}

function validateCoverage(
  value: unknown,
  source: string,
): CoverageConfig {
  const coverage = assertObject(value, source, '"coverage"');

  for (const key of Object.keys(coverage)) {
    if (!knownCoverageKeys.has(key)) {
      throw new ConfigError(
        `${source}: unknown coverage option "${key}".`,
      );
    }
  }

  const result: CoverageConfig = {};

  if (coverage.enabled !== undefined) {
    if (typeof coverage.enabled !== 'boolean') {
      throw new ConfigError(
        `${source}: "coverage.enabled" must be a boolean.`,
      );
    }

    result.enabled = coverage.enabled;
  }

  if (coverage.provider !== undefined) {
    if (coverage.provider !== 'v8') {
      throw new ConfigError(
        `${source}: "coverage.provider" must be "v8".`,
      );
    }

    result.provider = 'v8';
  }

  if (coverage.reporter !== undefined) {
    if (!Array.isArray(coverage.reporter)) {
      throw new ConfigError(
        `${source}: "coverage.reporter" must be an array.`,
      );
    }

    result.reporter = coverage.reporter.map((entry) => {
      if (
        typeof entry !== 'string' ||
        !coverageReporterNames.has(entry as CoverageReporterName)
      ) {
        throw new ConfigError(
          `${source}: unknown coverage reporter "${String(entry)}".`,
        );
      }

      return entry as CoverageReporterName;
    });
  }

  if (coverage.include !== undefined) {
    result.include = validateStringArray(
      coverage.include,
      source,
      'coverage.include',
    );
  }

  if (coverage.exclude !== undefined) {
    result.exclude = validateStringArray(
      coverage.exclude,
      source,
      'coverage.exclude',
    );
  }

  if (coverage.reportsDirectory !== undefined) {
    if (
      typeof coverage.reportsDirectory !== 'string' ||
      coverage.reportsDirectory.trim().length === 0
    ) {
      throw new ConfigError(
        `${source}: "coverage.reportsDirectory" must be a non-empty string.`,
      );
    }

    result.reportsDirectory = coverage.reportsDirectory;
  }

  if (coverage.thresholds !== undefined) {
    const thresholds = assertObject(
      coverage.thresholds,
      source,
      '"coverage.thresholds"',
    );

    for (const key of Object.keys(thresholds)) {
      if (!knownThresholdKeys.has(key)) {
        throw new ConfigError(
          `${source}: unknown coverage threshold "${key}".`,
        );
      }
    }

    const validated: Record<string, number> = {};

    for (const [key, threshold] of Object.entries(thresholds)) {
      if (
        typeof threshold !== 'number' ||
        !Number.isFinite(threshold) ||
        threshold < 0
      ) {
        throw new ConfigError(
          `${source}: coverage threshold "${key}" must be a non-negative number.`,
        );
      }

      if (threshold > 100) {
        throw new ConfigError(
          `${source}: coverage threshold "${key}" must not exceed 100.`,
        );
      }

      validated[key] = threshold;
    }

    result.thresholds = validated;
  }

  return result;
}

export function validateConfig(value: unknown, source: string): GuchhoConfig {
  const config = assertObject(value, source, 'configuration');

  for (const key of Object.keys(config)) {
    if (!knownConfigKeys.has(key)) {
      throw new ConfigError(`${source}: unknown configuration option "${key}".`);
    }
  }

  const result: GuchhoConfig = {};

  if (config.include !== undefined) {
    result.include = validateStringArray(config.include, source, 'include');
  }

  if (config.exclude !== undefined) {
    result.exclude = validateStringArray(config.exclude, source, 'exclude');
  }

  if (config.timeout !== undefined) {
    result.timeout = validateTimeout(config.timeout, source);
  }

  if (config.plugins !== undefined) {
    result.plugins = validateStringArray(config.plugins, source, 'plugins');
  }

  if (config.reporters !== undefined) {
    result.reporters = validateReporters(
      config.reporters,
      source,
      result.plugins !== undefined && result.plugins.length > 0,
    );
  }

  if (config.coverage !== undefined) {
    result.coverage = validateCoverage(config.coverage, source);
  }

  return result;
}

export async function discoverConfigFile(
  cwd: string,
): Promise<string | undefined> {
  let directory = path.resolve(cwd);

  for (;;) {
    for (const name of configFileNames) {
      const candidate = path.join(directory, name);
      if (await isFile(candidate)) {
        return candidate;
      }
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }

    directory = parent;
  }
}

async function loadConfigFile(filePath: string): Promise<GuchhoConfig> {
  const extension = path.extname(filePath);

  if (!configExtensions.has(extension)) {
    throw new ConfigError(
      `Unsupported configuration file extension "${extension}" in ${filePath}.`,
    );
  }

  let exported: unknown;

  if (extension === '.json') {
    let text: string;
    try {
      text = await readFile(filePath, 'utf8');
    } catch (error) {
      throw new ConfigError(
        `Failed to read configuration file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      exported = JSON.parse(text);
    } catch (error) {
      throw new ConfigError(
        `Failed to parse configuration file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    try {
      const module = await import(pathToFileURL(filePath).href);
      exported = await module.default;
    } catch (error) {
      throw new ConfigError(
        `Failed to load configuration file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return validateConfig(exported, filePath);
}

export async function loadConfig(
  cwd: string,
  explicitPath?: string | undefined,
): Promise<LoadedConfig | undefined> {
  let filePath: string | undefined;

  if (explicitPath !== undefined) {
    filePath = path.resolve(cwd, explicitPath);

    if (!(await isFile(filePath))) {
      throw new ConfigError(`Configuration file not found: ${explicitPath}`);
    }
  } else {
    filePath = await discoverConfigFile(cwd);
  }

  if (filePath === undefined) {
    return undefined;
  }

  return {
    config: await loadConfigFile(filePath),
    path: filePath,
  };
}

export function resolveConfig(
  loaded: LoadedConfig | undefined,
  overrides: ConfigOverrides = {},
): ResolvedConfig {
  const config = loaded?.config;
  const coverage = config?.coverage;
  const defaultCoverage = defaultConfig.coverage ?? {};
  const resolvedCoverage: CoverageConfig = {
    ...defaultCoverage,
    ...coverage,
  };
  const thresholds = coverage?.thresholds ?? defaultCoverage.thresholds;

  if (thresholds !== undefined) {
    resolvedCoverage.thresholds = thresholds;
  }

  return {
    include: config?.include ?? [...(defaultConfig.include ?? [])],
    exclude: config?.exclude ?? [...(defaultConfig.exclude ?? [])],
    timeout: overrides.timeout ?? config?.timeout ?? defaultTimeout,
    reporters: config?.reporters ?? [...(defaultConfig.reporters ?? [])],
    plugins: config?.plugins ?? [],
    coverage: resolvedCoverage,
  };
}
