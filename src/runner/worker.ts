import { parentPort, workerData } from 'node:worker_threads';

import { CoverageCollector } from '../coverage/collect-worker.js';
import { pathToFileURL } from 'node:url';

import { resetModuleMocks, setCurrentTestFile } from '../mock/module.js';
import { configureSnapshots } from '../snapshot/session.js';
import { registerTypeScriptLoader } from '../transform/register.js';
import {
  getRegisteredTestCount,
  getRootSuite,
  resetRegistry,
} from './registry.js';
import { runSuite } from './executor.js';
import {
  serializeError,
  serializeRunResult,
} from './serialize.js';
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

  registerTypeScriptLoader();
  resetRegistry();
  resetModuleMocks();
  setCurrentTestFile(input.file);
  configureSnapshots({
    testFile: input.file,
    update: input.updateSnapshots === true,
  });

  const collector = input.coverage ? await CoverageCollector.start() : undefined;
  let outcome: WorkerOutcome;

  try {
    outcome = await runTests(input);
  } finally {
    if (collector !== undefined) {
      // Collected after the test module and its dependencies run.
      const coverage = await collector.stop();
      outcome = { ...outcome!, coverage };
    }
  }

  return outcome;
}

async function runTests(input: WorkerInput): Promise<WorkerOutcome> {
  try {
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

  return {
    kind: 'result',
    file: input.file,
    result: serializeRunResult(result, getRegisteredTestCount()),
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
