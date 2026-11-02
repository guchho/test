import { parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';

import { CoverageCollector } from '../coverage/collect-worker.js';
import { pathToFileURL } from 'node:url';

import { installEnvironment } from '../environment/index.js';
import { resetModuleMocks, setCurrentTestFile } from '../mock/module.js';
import { configureSnapshots, finalizeSnapshots } from '../snapshot/session.js';
import { installGlobals, removeGlobals } from './globals.js';
import { registerTypeScriptLoader } from '../transform/register.js';
import {
  getRegisteredTestCount,
  getRootSuite,
  resetRegistry,
} from './registry.js';
import { runSuite } from './executor.js';
import { serializeError, serializeRunResult } from './serialize.js';
import type { WorkerInput, WorkerOutcome } from './serialize.js';

function decodeForkInput(): WorkerInput {
  const encoded = process.argv[2];

  if (encoded === undefined) {
    throw new Error('Worker input was not provided.');
  }

  return JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as WorkerInput;
}

const consoleMethods = [
  'log',
  'info',
  'warn',
  'error',
  'debug',
  'trace',
  'dir',
  'dirxml',
  'table',
  'group',
  'groupCollapsed',
  'groupEnd',
  'time',
  'timeEnd',
  'timeLog',
  'count',
  'countReset',
  'assert',
  'clear',
] as const;

function silenceConsole(): () => void {
  const target = console as unknown as Record<string, unknown>;
  const saved = new Map<string, unknown>();

  for (const method of consoleMethods) {
    if (typeof target[method] === 'function') {
      saved.set(method, target[method]);
      target[method] = (): void => {};
    }
  }

  return (): void => {
    for (const [method, value] of saved) {
      target[method] = value;
    }
  };
}

function resolveInput(): WorkerInput {
  if (parentPort !== null) {
    return workerData as WorkerInput;
  }

  return decodeForkInput();
}

async function execute(input: WorkerInput): Promise<WorkerOutcome> {
  if (typeof process.setSourceMapsEnabled === 'function') {
    process.setSourceMapsEnabled(true);
  }

  registerTypeScriptLoader({
    tsconfig: input.tsconfig,
    cwd: process.cwd(),
  });
  resetRegistry();
  resetModuleMocks();
  setCurrentTestFile(input.file);
  configureSnapshots({
    testFile: input.file,
    update: input.updateSnapshots === true,
  });

  const collector = input.coverage
    ? await CoverageCollector.start()
    : undefined;
  let outcome: WorkerOutcome;

  try {
    const environment = await installEnvironment(
      input.environment,
      input.environmentOptions,
    );
    if (input.globals) {
      installGlobals();
    }

    const restoreConsole = input.silent ? silenceConsole() : undefined;

    try {
      outcome = await runTests(input);
    } finally {
      restoreConsole?.();

      if (input.globals) {
        removeGlobals();
      }

      environment.teardown();
    }
  } finally {
    if (collector !== undefined) {
      // Collected after the test module and its dependencies run.
      const coverage = await collector.stop();
      outcome = { ...outcome!, coverage };
    }
  }

  return outcome;
}

async function loadSetupFiles(
  files: readonly string[],
  label: string,
): Promise<void> {
  for (const file of files) {
    try {
      await import(pathToFileURL(file).href);
    } catch (error) {
      const detail =
        error instanceof Error
          ? (error.stack ?? error.message)
          : serializeError(error).inspected;
      throw new Error(`Failed to load ${label} "${file}":\n${detail}`, {
        cause: error,
      });
    }
  }
}

const commonJsExtensions = new Set(['.cts', '.cjs']);

async function preloadCommonJsDependencies(file: string): Promise<void> {
  if (!commonJsExtensions.has(path.extname(file))) {
    return;
  }

  // Node.js cannot link a nested ESM graph when it is first reached through a
  // synchronous require() from CommonJS. Preload the package entry so that
  // CommonJS test files can require('@guchho/test') on every supported version.
  await import(new URL('../index.js', import.meta.url).href);
}

async function runTests(input: WorkerInput): Promise<WorkerOutcome> {
  try {
    await loadSetupFiles(input.setupFiles, 'setup file');
    await loadSetupFiles(input.setupFilesAfterEnv, 'setupFilesAfterEnv entry');
  } catch (error) {
    return {
      kind: 'failure',
      file: input.file,
      message: serializeError(error).inspected,
    };
  }

  try {
    await preloadCommonJsDependencies(input.file);
    await import(pathToFileURL(input.file).href);
  } catch (error) {
    return {
      kind: 'load-error',
      file: input.file,
      error: serializeError(error),
    };
  }

  const testNamePattern =
    input.testNamePattern === undefined
      ? undefined
      : new RegExp(input.testNamePattern.source, input.testNamePattern.flags);

  const result = await runSuite(getRootSuite(), {
    timeout: input.timeout,
    filter: input.filter,
    testNamePattern,
    bail: input.bail,
  });

  const snapshots = finalizeSnapshots({
    prune:
      input.updateSnapshots &&
      input.filter === undefined &&
      input.testNamePattern === undefined,
  });

  return {
    kind: 'result',
    file: input.file,
    result: serializeRunResult(result, getRegisteredTestCount()),
    obsoleteSnapshots: snapshots.obsolete,
    prunedSnapshots: snapshots.pruned,
  };
}

async function main(): Promise<void> {
  let outcome: WorkerOutcome;

  try {
    outcome = await execute(resolveInput());
  } catch (error) {
    outcome = {
      kind: 'failure',
      file: process.argv[1] ?? '<unknown>',
      message: serializeError(error).inspected,
    };
  }

  if (parentPort !== null) {
    parentPort.postMessage(outcome);
    return;
  }

  if (typeof process.send === 'function') {
    process.send(outcome, () => {
      process.exit(0);
    });
    return;
  }

  throw new Error('Guchho test worker was started without a parent.');
}

await main();
