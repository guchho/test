import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { EnvironmentName } from '../config/types.js';
import { installEnvironment } from '../environment/index.js';
import { resetModuleMocks, setCurrentTestFile } from '../mock/module.js';
import { installGlobals, removeGlobals } from '../runner/globals.js';
import { configureSnapshots, finalizeSnapshots } from '../snapshot/session.js';
import { registerTypeScriptLoader } from '../transform/register.js';
import { runSuite } from '../runner/executor.js';
import {
  getRegisteredTestCount,
  getRootSuite,
  resetRegistry,
} from '../runner/registry.js';
import type { HookError, RunSummary, TestResult } from '../runner/types.js';

export interface RunTestsOptions {
  readonly files: readonly string[];
  readonly cwd?: string;
  readonly timeout?: number;
  readonly filter?: string | undefined;
  readonly testNamePattern?: RegExp | undefined;
  readonly bail?: boolean;
  readonly setupFiles?: readonly string[];
  readonly setupFilesAfterEnv?: readonly string[];
  readonly globalSetup?: string | undefined;
  readonly globalTeardown?: string | undefined;
  readonly environment?: EnvironmentName;
  readonly environmentOptions?: Readonly<Record<string, unknown>>;
  readonly globals?: boolean;
  readonly tsconfig?: string | undefined;
  readonly updateSnapshots?: boolean;
}

export interface FileRunResult {
  readonly file: string;
  readonly results: readonly TestResult[];
  readonly errors: readonly HookError[];
  readonly summary: RunSummary;
  readonly duration: number;
  readonly success: boolean;
  readonly testCount: number;
  readonly obsoleteSnapshots: readonly string[];
  readonly prunedSnapshots: readonly string[];
}

export interface RunTestsResult {
  readonly files: readonly FileRunResult[];
  readonly summary: RunSummary;
  readonly duration: number;
  readonly success: boolean;
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

let runCounter = 0;

function addSummary(target: RunSummary, source: RunSummary): RunSummary {
  return {
    total: target.total + source.total,
    passed: target.passed + source.passed,
    failed: target.failed + source.failed,
    skipped: target.skipped + source.skipped,
    todo: target.todo + source.todo,
  };
}

async function loadModule(file: string): Promise<void> {
  await import(pathToFileURL(file).href);
}

async function loadSetupFiles(
  cwd: string,
  files: readonly string[],
  label: string,
): Promise<void> {
  for (const file of files) {
    const absolutePath = path.resolve(cwd, file);

    try {
      await loadModule(absolutePath);
    } catch (error) {
      const detail =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      throw new Error(`Failed to load ${label} "${file}":\n${detail}`, {
        cause: error,
      });
    }
  }
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
      { cause: error },
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

async function runOneFile(
  absoluteFile: string,
  options: RunTestsOptions,
  cwd: string,
  testNamePattern: RegExp | undefined,
): Promise<FileRunResult> {
  resetRegistry();
  resetModuleMocks();
  setCurrentTestFile(absoluteFile);
  configureSnapshots({
    testFile: absoluteFile,
    update: options.updateSnapshots === true,
  });

  const environment = await installEnvironment(
    options.environment ?? 'node',
    options.environmentOptions,
  );

  try {
    await loadSetupFiles(cwd, options.setupFiles ?? [], 'setup file');
    await loadSetupFiles(
      cwd,
      options.setupFilesAfterEnv ?? [],
      'setupFilesAfterEnv entry',
    );

    runCounter += 1;
    try {
      await import(
        `${pathToFileURL(absoluteFile).href}?guchho-run=${runCounter}`
      );
    } catch (error) {
      const detail =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      throw new Error(
        `Failed to load test file "${absoluteFile}":\n${detail}`,
        {
          cause: error,
        },
      );
    }

    const result = await runSuite(getRootSuite(), {
      timeout: options.timeout,
      filter: options.filter,
      testNamePattern,
      bail: options.bail ?? false,
    });

    const snapshots = finalizeSnapshots({
      prune:
        options.updateSnapshots === true &&
        options.filter === undefined &&
        options.testNamePattern === undefined,
    });

    return {
      file: absoluteFile,
      results: result.results,
      errors: result.errors,
      summary: result.summary,
      duration: result.duration,
      success: result.success,
      testCount: getRegisteredTestCount(),
      obsoleteSnapshots: snapshots.obsolete,
      prunedSnapshots: snapshots.pruned,
    };
  } finally {
    environment.teardown();
  }
}

export async function runTests(
  options: RunTestsOptions,
): Promise<RunTestsResult> {
  if (!Array.isArray(options.files) || options.files.length === 0) {
    throw new TypeError('runTests requires a non-empty array of test files.');
  }

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const testNamePattern = options.testNamePattern;

  registerTypeScriptLoader({ cwd, tsconfig: options.tsconfig });

  const start = Date.now();
  const globals = options.globals === true;

  if (globals) {
    installGlobals();
  }

  let setupComplete = false;

  try {
    await runGlobalHook(options.globalSetup, 'globalSetup', cwd);
    setupComplete = true;

    const files: FileRunResult[] = [];
    let summary = emptySummary;

    for (const file of options.files) {
      const absoluteFile = path.resolve(cwd, file);
      const result = await runOneFile(
        absoluteFile,
        options,
        cwd,
        testNamePattern,
      );

      files.push(result);
      summary = addSummary(summary, result.summary);
    }

    return {
      files,
      summary,
      duration: Date.now() - start,
      success: files.every((file) => file.success),
    };
  } finally {
    try {
      if (setupComplete) {
        await runGlobalHook(options.globalTeardown, 'globalTeardown', cwd);
      }
    } finally {
      if (globals) {
        removeGlobals();
      }
    }
  }
}
