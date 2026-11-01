import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ConfigError,
  loadConfig,
  resolveConfig,
} from '../config/load.js';
import type {
  CoverageConfig,
  ReporterEntry,
} from '../config/types.js';
import { buildCoverageReport } from '../coverage/collect.js';
import {
  checkThresholds,
  writeCoverageReport,
} from '../coverage/report.js';
import type {
  CoveragePayload,
  CoverageReport,
} from '../coverage/types.js';
import { loadPlugins } from '../plugins/load.js';
import type { ReporterFactories } from '../plugins/load.js';
import { createReporters, ReporterError } from '../reporters/index.js';
import type { FileReport, Reporter, RunReport } from '../reporters/types.js';
import { formatError } from '../runner/errors.js';
import { WorkerPool } from '../runner/pool.js';
import type { FileOutcome } from '../runner/pool.js';
import type { WorkerInput } from '../runner/serialize.js';
import type {
  ExecutionPool,
  RunSummary,
} from '../runner/types.js';
import { registerTypeScriptLoader } from '../transform/register.js';
import { watchTests } from '../watch/watcher.js';
import { discoverTestFiles } from './discovery.js';
import { helpText } from './help.js';
import { CliError, parseArgs } from './parser.js';
import type { RunCommand } from './parser.js';

interface CliIO {
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

interface ExecutionOptions {
  readonly filter: string | undefined;
  readonly testNamePattern: RegExp | undefined;
  readonly timeout: number;
  readonly maxWorkers: number;
  readonly pool: ExecutionPool;
  readonly bail: boolean;
  readonly updateSnapshots: boolean;
  readonly coverage: boolean;
  readonly setupFiles: readonly string[];
  readonly setupFilesAfterEnv: readonly string[];
  readonly globalSetup: string | undefined;
  readonly globalTeardown: string | undefined;
}

interface GlobalHookContext {
  readonly cwd: string;
}

type GlobalHook = (context: GlobalHookContext) => void | Promise<void>;

const emptySummary: RunSummary = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  todo: 0,
};

function createDefaultIO(): CliIO {
  return {
    cwd: process.cwd(),
    stdout: (text: string): void => {
      process.stdout.write(text);
    },
    stderr: (text: string): void => {
      process.stderr.write(text);
    },
  };
}

async function runGlobalHook(
  file: string | undefined,
  label: 'globalSetup' | 'globalTeardown',
  cwd: string,
): Promise<void> {
  if (file === undefined) {
    return;
  }

  const absolutePath = path.resolve(cwd, file);
  let loaded: Record<string, unknown>;

  try {
    loaded = (await import(pathToFileURL(absolutePath).href)) as Record<
      string,
      unknown
    >;
  } catch (error) {
    throw new Error(
      `Failed to load ${label} module "${file}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const named = label === 'globalSetup' ? loaded.setup : loaded.teardown;
  const hook = [loaded.default, loaded[label], named].find(
    (candidate): candidate is GlobalHook => typeof candidate === 'function',
  );

  if (hook === undefined) {
    throw new Error(`${label} module "${file}" must export a function.`);
  }

  await hook({ cwd });
}

function displayPath(cwd: string, file: string): string {
  const relative = path.relative(cwd, file);
  if (relative.length === 0) {
    return file;
  }

  return relative.split(path.sep).join('/');
}

function addSummary(target: RunSummary, source: RunSummary): RunSummary {
  return {
    total: target.total + source.total,
    passed: target.passed + source.passed,
    failed: target.failed + source.failed,
    skipped: target.skipped + source.skipped,
    todo: target.todo + source.todo,
  };
}

function compileNamePattern(pattern: string | undefined): RegExp | undefined {
  if (pattern === undefined) {
    return undefined;
  }

  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new CliError(
      `Invalid --testNamePattern value "${pattern}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function resolveExplicitFiles(
  files: readonly string[],
  cwd: string,
): Promise<string[]> {
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const absolutePath = path.resolve(cwd, file);

    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch {
      throw new CliError(`Test file not found: ${file}`);
    }

    if (!fileStat.isFile()) {
      throw new CliError(`Not a test file: ${file}`);
    }

    if (!seen.has(absolutePath)) {
      seen.add(absolutePath);
      resolved.push(absolutePath);
    }
  }

  return resolved;
}

async function resolveFiles(
  files: readonly string[],
  cwd: string,
  stderr: (text: string) => void,
  include: readonly string[],
  exclude: readonly string[],
): Promise<string[]> {
  if (files.length > 0) {
    return resolveExplicitFiles(files, cwd);
  }

  const discovered = await discoverTestFiles({
    cwd,
    include,
    exclude,
  });

  if (discovered.length === 0) {
    stderr('guchho-test: No test files found.\n');
  }

  return discovered.map((file) => path.resolve(cwd, file));
}

async function executeFiles(
  files: readonly string[],
  options: ExecutionOptions,
  reporterEntries: readonly ReporterEntry[],
  coverageConfig: Readonly<CoverageConfig>,
  customReporters: ReporterFactories,
  io: CliIO,
): Promise<number> {
  const reporters: Reporter[] = createReporters(
    reporterEntries,
    io,
    customReporters,
  );
  const pool = new WorkerPool({
    maxWorkers: options.bail ? 1 : options.maxWorkers,
    pool: options.pool,
  });

  const setupFiles = options.setupFiles.map((file) =>
    path.resolve(io.cwd, file),
  );
  const setupFilesAfterEnv = options.setupFilesAfterEnv.map((file) =>
    path.resolve(io.cwd, file),
  );

  const tasks: WorkerInput[] = files.map((file) => ({
    file,
    timeout: options.timeout,
    filter: options.filter,
    testNamePattern:
      options.testNamePattern === undefined
        ? undefined
        : {
            source: options.testNamePattern.source,
            flags: options.testNamePattern.flags,
          },
    bail: options.bail,
    updateSnapshots: options.updateSnapshots,
    coverage: coverageConfig.enabled === true,
    setupFiles,
    setupFilesAfterEnv,
  }));

  let executionError = false;
  let testFailure = false;
  let totalDuration = 0;
  let total = emptySummary;
  const fileReports: FileReport[] = [];
  const coveragePayloads: CoveragePayload[] = [];

  try {
    await runGlobalHook(options.globalSetup, 'globalSetup', io.cwd);
  } catch (error) {
    io.stderr(`Failed to run globalSetup: ${formatError(error)}\n`);
    await pool.close();
    return 2;
  }

  for (const reporter of reporters) {
    reporter.onRunStart?.(files.length);
  }

  try {
    const outcomes = await pool.run(tasks, options.bail);

    for (const outcome of outcomes) {
      if (outcome.coverage !== undefined) {
        coveragePayloads.push(outcome.coverage);
      }

      publishOutcome(
        outcome,
        io,
        reporters,
        (report) => {
          fileReports.push(report);
          total = addSummary(total, report.summary);
          totalDuration += report.duration;

          if (!report.success) {
            testFailure = true;
          }
        },
        () => {
          executionError = true;
        },
      );
    }
  } finally {
    await pool.close();

    try {
      await runGlobalHook(options.globalTeardown, 'globalTeardown', io.cwd);
    } catch (error) {
      executionError = true;
      io.stderr(`Failed to run globalTeardown: ${formatError(error)}\n`);
    }
  }

  let coverageReport: CoverageReport | undefined;
  let coverageFailures = 0;
  let coverageError = false;

  if (coverageConfig.enabled) {
    try {
      coverageReport = buildCoverageReport({
        cwd: io.cwd,
        include: coverageConfig.include ?? [],
        exclude: coverageConfig.exclude ?? [],
        payloads: coveragePayloads,
      });
      coverageFailures = checkThresholds(
        coverageReport,
        coverageConfig,
      ).length;
    } catch (error) {
      coverageError = true;
      io.stderr(`Failed to collect coverage: ${formatError(error)}\n`);
    }
  }

  const runReport: RunReport = {
    files: fileReports,
    summary: total,
    duration: totalDuration,
    success:
      !executionError &&
      !testFailure &&
      !coverageError &&
      coverageFailures === 0,
  };

  for (const reporter of reporters) {
    reporter.onRunFinish?.(runReport);
  }

  if (coverageReport !== undefined) {
    const thresholds = checkThresholds(coverageReport, coverageConfig);

    try {
      writeCoverageReport(coverageReport, coverageConfig, io.cwd, {
        stdout: io.stdout,
        stderr: io.stderr,
        machine: reporterEntries.some((entry) => {
          const name = typeof entry === 'string' ? entry : entry[0];
          return name === 'json' || name === 'junit';
        }),
      });
    } catch (error) {
      coverageError = true;
      io.stderr(`Failed to write coverage reports: ${formatError(error)}\n`);
    }

    if (thresholds.length > 0) {
      io.stderr('Coverage thresholds not met:\n');
      for (const failure of thresholds) {
        io.stderr(
          `  ${failure.metric}: ${failure.actual.toFixed(2)}% is below ${failure.expected.toFixed(2)}%\n`,
        );
      }
    }
  }

  if (executionError || coverageError) {
    return 2;
  }

  return testFailure || coverageFailures > 0 ? 1 : 0;
}

function publishOutcome(
  outcome: FileOutcome,
  io: CliIO,
  reporters: readonly Reporter[],
  onReport: (report: FileReport) => void,
  onExecutionError: () => void,
): void {
  const display = displayPath(io.cwd, outcome.file);

  if (outcome.kind === 'load-error') {
    onExecutionError();
    io.stderr(`Failed to load test file "${display}".\n`);
    io.stderr(`${formatError(outcome.error)}\n`);
    return;
  }

  if (outcome.kind === 'failure') {
    onExecutionError();
    io.stderr(`Failed while executing "${display}".\n`);
    io.stderr(`${outcome.message}\n`);
    return;
  }

  for (const reporter of reporters) {
    reporter.onFileStart?.(display);
  }

  if (outcome.testCount === 0) {
    io.stderr(`Warning: no tests were registered in "${display}".\n`);
    return;
  }

  for (const result of outcome.result.results) {
    for (const reporter of reporters) {
      reporter.onTestResult?.(result, display);
    }
  }

  for (const error of outcome.result.errors) {
    for (const reporter of reporters) {
      reporter.onHookError?.(error, display);
    }
  }

  const report: FileReport = {
    display,
    results: outcome.result.results,
    errors: outcome.result.errors,
    summary: outcome.result.summary,
    duration: outcome.result.duration,
    success: outcome.result.success,
  };

  for (const reporter of reporters) {
    reporter.onFileFinish?.(report);
  }

  onReport(report);
}

function executionOptions(
  parsed: RunCommand,
  timeout: number,
  setupFiles: readonly string[],
  setupFilesAfterEnv: readonly string[],
): ExecutionOptions {
  return {
    filter: parsed.filter,
    testNamePattern: compileNamePattern(parsed.testNamePattern),
    timeout,
    maxWorkers: parsed.maxWorkers ?? 1,
    pool: parsed.pool ?? 'threads',
    bail: parsed.bail,
    updateSnapshots: parsed.updateSnapshots,
    coverage: parsed.coverage,
    setupFiles,
    setupFilesAfterEnv,
  };
}

function reporterEntries(
  parsed: RunCommand,
  configured: readonly ReporterEntry[],
): ReporterEntry[] {
  if (parsed.reporter !== undefined) {
    return [parsed.reporter];
  }

  return [...configured];
}

async function runWatch(
  options: ExecutionOptions,
  entries: readonly ReporterEntry[],
  coverageConfig: Readonly<CoverageConfig>,
  customReporters: ReporterFactories,
  include: readonly string[],
  exclude: readonly string[],
  io: CliIO,
): Promise<number> {
  const controller = new AbortController();
  const stop = (): void => {
    controller.abort();
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await watchTests({
      cwd: io.cwd,
      include,
      exclude,
      signal: controller.signal,
      log: io.stdout,
      error: io.stderr,
      run: async (files) => {
        const code = await executeFiles(
          files,
          options,
          entries,
          coverageConfig,
          customReporters,
          io,
        );
        return { success: code === 0 };
      },
    });
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }

  return 0;
}

export async function main(
  argv: readonly string[],
  io: CliIO = createDefaultIO(),
): Promise<number> {
  if (typeof process.setSourceMapsEnabled === 'function') {
    process.setSourceMapsEnabled(true);
  }

  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof CliError) {
      io.stderr(`guchho-test: ${error.message}\n`);
      return 2;
    }

    throw error;
  }

  if (parsed.kind === 'help') {
    io.stdout(helpText);
    return 0;
  }

  if (parsed.kind === 'version') {
    const { version } = await import('../version.js');
    io.stdout(`${version}\n`);
    return 0;
  }

  try {
    registerTypeScriptLoader();

    const loaded = await loadConfig(io.cwd, parsed.config);
    const config = resolveConfig(loaded, { timeout: parsed.timeout });
    const options = executionOptions(
      parsed,
      config.timeout,
      config.setupFiles,
      config.setupFilesAfterEnv,
    );
    const entries = reporterEntries(parsed, config.reporters);
    const coverageConfig = parsed.coverage
      ? { ...config.coverage, enabled: true }
      : config.coverage;
    const customReporters = await loadPlugins(config.plugins, io.cwd);

    if (parsed.watch) {
      return await runWatch(
        options,
        entries,
        coverageConfig,
        customReporters,
        config.include,
        config.exclude,
        io,
      );
    }

    const files = await resolveFiles(
      parsed.files,
      io.cwd,
      io.stderr,
      config.include,
      config.exclude,
    );

    if (files.length === 0) {
      return 2;
    }

    return await executeFiles(
      files,
      options,
      entries,
      coverageConfig,
      customReporters,
      io,
    );
  } catch (error) {
    if (
      error instanceof CliError ||
      error instanceof ConfigError ||
      error instanceof ReporterError
    ) {
      io.stderr(`guchho-test: ${error.message}\n`);
      return 2;
    }

    io.stderr(`guchho-test: ${formatError(error)}\n`);
    return 2;
  }
}
