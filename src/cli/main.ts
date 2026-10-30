import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  defaultExclude,
  defaultInclude,
  defaultTimeout,
} from '../config/defaults.js';
import { formatError } from '../runner/errors.js';
import { runSuite } from '../runner/executor.js';
import {
  getRegisteredTestCount,
  getRootSuite,
  resetRegistry,
} from '../runner/registry.js';
import type {
  HookError,
  RunResult,
  RunSummary,
  TestResult,
} from '../runner/types.js';
import { discoverTestFiles } from './discovery.js';
import { helpText } from './help.js';
import { CliError, parseArgs } from './parser.js';

interface CliIO {
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

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

function formatDuration(duration: number): string {
  return duration < 1 ? '<1ms' : `${Math.round(duration)}ms`;
}

function displayPath(cwd: string, file: string): string {
  const relative = path.relative(cwd, file);
  if (relative.length === 0) {
    return file;
  }

  return relative.split(path.sep).join('/');
}

function printResult(result: TestResult, io: CliIO): void {
  switch (result.status) {
    case 'passed':
      io.stdout(`✓ ${result.fullName} (${formatDuration(result.duration)})\n`);
      break;
    case 'failed': {
      io.stdout(`✗ ${result.fullName} (${formatDuration(result.duration)})\n`);
      const error = formatError(result.error);
      io.stdout(`${error.split('\n').map((line) => `  ${line}`).join('\n')}\n`);
      break;
    }
    case 'skipped':
      io.stdout(`- ${result.fullName} (skipped)\n`);
      break;
    case 'todo':
      io.stdout(`○ ${result.fullName} (todo)\n`);
      break;
  }
}

function printHookErrors(errors: readonly HookError[], io: CliIO): void {
  for (const hookError of errors) {
    const error = formatError(hookError.error);
    io.stdout(
      `✗ ${hookError.type} hook in "${hookError.suite}" failed\n` +
        `${error.split('\n').map((line) => `  ${line}`).join('\n')}\n`,
    );
  }
}

function printSummary(summary: RunSummary, duration: number, io: CliIO): void {
  io.stdout(
    `\nTests: ${summary.passed} passed, ${summary.failed} failed, ` +
      `${summary.skipped} skipped, ${summary.todo} todo ` +
      `(${formatDuration(duration)})\n`,
  );
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
): Promise<string[]> {
  if (files.length > 0) {
    return resolveExplicitFiles(files, cwd);
  }

  const discovered = await discoverTestFiles({
    cwd,
    include: defaultInclude,
    exclude: defaultExclude,
  });

  if (discovered.length === 0) {
    stderr('guchho-test: No test files found.\n');
  }

  return discovered.map((file) => path.resolve(cwd, file));
}

async function runFiles(
  files: readonly string[],
  filter: string | undefined,
  cwd: string,
  io: CliIO,
): Promise<number> {
  let executionError = false;
  let testFailure = false;
  let totalDuration = 0;
  let total: RunSummary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    todo: 0,
  };

  for (const file of files) {
    const display = displayPath(cwd, file);
    io.stdout(`\n${display}\n`);

    resetRegistry();

    try {
      await import(pathToFileURL(file).href);
    } catch (error) {
      executionError = true;
      io.stderr(`Failed to load test file "${display}".\n`);
      io.stderr(`${formatError(error)}\n`);
      continue;
    }

    if (getRegisteredTestCount() === 0) {
      io.stderr(`Warning: no tests were registered in "${display}".\n`);
      continue;
    }

    let result: RunResult;
    try {
      result = await runSuite(getRootSuite(), {
        timeout: defaultTimeout,
        filter,
      });
    } catch (error) {
      executionError = true;
      io.stderr(`Failed while executing "${display}".\n`);
      io.stderr(`${formatError(error)}\n`);
      continue;
    }

    for (const testResult of result.results) {
      printResult(testResult, io);
    }

    printHookErrors(result.errors, io);

    if (result.results.length === 0) {
      io.stdout('No tests matched the current filter.\n');
    }

    printSummary(result.summary, result.duration, io);
    total = addSummary(total, result.summary);
    totalDuration += result.duration;

    if (!result.success) {
      testFailure = true;
    }
  }

  if (files.length > 1) {
    io.stdout('\nOverall\n');
    printSummary(total, totalDuration, io);
  }

  if (executionError) {
    return 2;
  }

  return testFailure ? 1 : 0;
}

export async function main(
  argv: readonly string[],
  io: CliIO = createDefaultIO(),
): Promise<number> {
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
    const files = await resolveFiles(parsed.files, io.cwd, io.stderr);

    if (files.length === 0) {
      return 2;
    }

    return await runFiles(files, parsed.filter, io.cwd, io);
  } catch (error) {
    if (error instanceof CliError) {
      io.stderr(`guchho-test: ${error.message}\n`);
      return 2;
    }

    io.stderr(`guchho-test: ${formatError(error)}\n`);
    return 2;
  }
}
