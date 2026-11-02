import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { CoveragePayload } from '../coverage/types.js';
import type {
  SerializedRunResult,
  WorkerInput,
  WorkerOutcome,
} from './serialize.js';
import { deserializeRunResult } from './serialize.js';
import type { ExecutionPool, RunResult } from './types.js';

export type FileOutcome =
  | {
      readonly kind: 'result';
      readonly file: string;
      readonly result: RunResult;
      readonly testCount: number;
      readonly coverage: CoveragePayload | undefined;
      readonly obsoleteSnapshots: readonly string[];
      readonly prunedSnapshots: readonly string[];
    }
  | {
      readonly kind: 'load-error';
      readonly file: string;
      readonly error: unknown;
      readonly coverage: CoveragePayload | undefined;
    }
  | {
      readonly kind: 'failure';
      readonly file: string;
      readonly message: string;
      readonly coverage: CoveragePayload | undefined;
    };

export interface PoolOptions {
  readonly maxWorkers: number;
  readonly pool: ExecutionPool;
}

function isWorkerOutcome(value: unknown): value is WorkerOutcome {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const kind = (value as { kind?: unknown }).kind;
  return kind === 'result' || kind === 'load-error' || kind === 'failure';
}

function toFileOutcome(outcome: WorkerOutcome): FileOutcome {
  switch (outcome.kind) {
    case 'result':
      return {
        kind: 'result',
        file: outcome.file,
        result: deserializeRunResult(outcome.result),
        testCount: outcome.result.testCount,
        coverage: outcome.coverage,
        obsoleteSnapshots: outcome.obsoleteSnapshots ?? [],
        prunedSnapshots: outcome.prunedSnapshots ?? [],
      };
    case 'load-error':
      return {
        kind: 'load-error',
        file: outcome.file,
        error: outcome.error,
        coverage: outcome.coverage,
      };
    case 'failure':
      return {
        kind: 'failure',
        file: outcome.file,
        message: outcome.message,
        coverage: outcome.coverage,
      };
  }
}

function failure(file: string, message: string): WorkerOutcome {
  return { kind: 'failure', file, message };
}

export class WorkerPool {
  readonly #options: PoolOptions;
  readonly #active = new Set<Worker | ChildProcess>();
  #closed = false;

  constructor(options: PoolOptions) {
    this.#options = options;
  }

  async run(
    tasks: readonly WorkerInput[],
    stopOnFailure = false,
  ): Promise<FileOutcome[]> {
    if (this.#closed) {
      throw new Error('The worker pool has been closed.');
    }

    const outcomes = new Array<FileOutcome | undefined>(tasks.length);
    const concurrency = Math.max(
      1,
      Math.min(this.#options.maxWorkers, tasks.length),
    );
    let nextIndex = 0;
    let stopped = false;

    const consume = async (): Promise<void> => {
      for (;;) {
        if (stopped || nextIndex >= tasks.length) {
          return;
        }

        const index = nextIndex;
        nextIndex += 1;
        const task = tasks[index];

        if (task === undefined) {
          return;
        }

        const outcome = await this.#runTask(task);
        outcomes[index] = toFileOutcome(outcome);

        if (
          stopOnFailure &&
          (outcome.kind !== 'result' || !outcome.result.success)
        ) {
          stopped = true;
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => consume()));

    return outcomes.filter(
      (outcome): outcome is FileOutcome => outcome !== undefined,
    );
  }

  async close(): Promise<void> {
    this.#closed = true;

    const running = [...this.#active];
    this.#active.clear();

    await Promise.all(
      running.map(async (worker) => {
        if (worker instanceof Worker) {
          await worker.terminate();
          return;
        }

        if (!worker.killed) {
          worker.kill();
        }
      }),
    );
  }

  #runTask(task: WorkerInput): Promise<WorkerOutcome> {
    if (this.#options.pool === 'forks') {
      return this.#runFork(task);
    }

    return this.#runThread(task);
  }

  #runThread(task: WorkerInput): Promise<WorkerOutcome> {
    return new Promise<WorkerOutcome>((resolve) => {
      const worker = new Worker(new URL('./worker.js', import.meta.url), {
        workerData: task,
      });
      this.#active.add(worker);
      let settled = false;

      const finish = (outcome: WorkerOutcome): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.#active.delete(worker);
        resolve(outcome);
      };

      worker.once('message', (message: unknown) => {
        finish(
          isWorkerOutcome(message)
            ? message
            : failure(task.file, 'Worker returned an invalid result.'),
        );
      });
      worker.once('error', (error: Error) => {
        finish(failure(task.file, error.stack ?? error.message));
      });
      worker.once('exit', (code) => {
        finish(
          failure(
            task.file,
            `Test worker exited unexpectedly with code ${code}.`,
          ),
        );
      });
    });
  }

  #runFork(task: WorkerInput): Promise<WorkerOutcome> {
    return new Promise<WorkerOutcome>((resolve) => {
      const encoded = Buffer.from(JSON.stringify(task), 'utf8').toString(
        'base64url',
      );
      const child = fork(
        fileURLToPath(new URL('./worker.js', import.meta.url)),
        [encoded],
        {
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        },
      );
      this.#active.add(child);
      let settled = false;

      const finish = (outcome: WorkerOutcome): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.#active.delete(child);
        resolve(outcome);

        if (!child.killed) {
          child.kill();
        }
      };

      child.once('message', (message: unknown) => {
        finish(
          isWorkerOutcome(message)
            ? message
            : failure(task.file, 'Worker returned an invalid result.'),
        );
      });
      child.once('error', (error: Error) => {
        finish(failure(task.file, error.stack ?? error.message));
      });
      child.once('exit', (code, signal) => {
        if (code === 0) {
          finish(
            failure(task.file, 'Worker exited without returning a result.'),
          );
          return;
        }

        finish(
          failure(
            task.file,
            `Test worker exited unexpectedly with code ${code ?? 'null'}${
              signal === null ? '' : ` (signal ${signal})`
            }.`,
          ),
        );
      });
    });
  }
}

export type { SerializedRunResult };
