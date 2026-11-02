import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';

import { discoverTestFiles } from '../cli/discovery.js';
import {
  affectedTests,
  collectDependencies,
  normalizeWatchPath,
} from './dependencies.js';

const ignoredDirectories = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.cache',
]);

export interface WatchOptions {
  readonly cwd: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly signal?: AbortSignal | undefined;
  readonly debounceMs?: number | undefined;
  readonly input?: Readable | undefined;
  readonly log: (text: string) => void;
  readonly error: (text: string) => void;
  readonly run: (
    files: readonly string[],
    filter?: string,
  ) => Promise<{ readonly success: boolean }>;
}

function shouldIgnore(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]/);
  return segments.some((segment) => ignoredDirectories.has(segment));
}

function displayPath(cwd: string, file: string): string {
  return path.relative(cwd, file).split(path.sep).join('/');
}

export async function watchTests(options: WatchOptions): Promise<void> {
  const { cwd, include, exclude, log, error } = options;
  const debounceMs = options.debounceMs ?? 100;
  let currentTests: string[] = [];
  let graph = new Map<string, Set<string>>();
  let watcher: FSWatcher | undefined;
  let timer: NodeJS.Timeout | undefined;
  let busy = false;
  let closed = false;
  let nameFilter: string | undefined;
  let filterDraft: string | undefined;
  let detachInput = (): void => {};
  let resolveStop: (() => void) | undefined;
  let stop = (): void => {};
  const pending = new Set<string>();

  const discover = async (): Promise<string[]> => {
    const files = await discoverTestFiles({ cwd, include, exclude });
    return files.map((file) => path.resolve(cwd, file));
  };

  const schedule = (delay: number): void => {
    if (closed) {
      return;
    }

    if (timer !== undefined) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = undefined;
      void processPending();
    }, delay);
  };

  const runFiles = async (files: readonly string[]): Promise<void> => {
    if (files.length === 0) {
      return;
    }

    log(
      `[watch] running ${files.length} test file${files.length === 1 ? '' : 's'}`,
    );

    for (const file of files) {
      log(`[watch]   ${displayPath(cwd, file)}`);
    }

    const result = await options.run(files, nameFilter);
    log(
      result.success
        ? '[watch] run completed successfully'
        : '[watch] run completed with failures',
    );
    log('[watch] waiting for file changes');
  };

  const rerunAll = (): void => {
    if (currentTests.length === 0) {
      log('[watch] no test files to run');
      return;
    }

    for (const file of currentTests) {
      pending.add(normalizeWatchPath(file));
    }

    schedule(0);
  };

  const applyFilter = (value: string): void => {
    nameFilter = value.length === 0 ? undefined : value;
    log(
      nameFilter === undefined
        ? '[watch] filter cleared'
        : `[watch] filter set to "${nameFilter}"`,
    );
    rerunAll();
  };

  const processInput = (text: string): void => {
    for (const character of [...text]) {
      if (filterDraft !== undefined) {
        if (character === '\r') {
          const draft = filterDraft;
          filterDraft = undefined;
          applyFilter(draft);
        } else if (character === '\n') {
          continue;
        } else if (character === '\u001b') {
          filterDraft = undefined;
          log('[watch] filter cancelled');
        } else if (character === '\u007f' || character === '\b') {
          filterDraft = filterDraft.slice(0, -1);
        } else if (character >= ' ') {
          filterDraft += character;
        }

        continue;
      }

      if (character === 'q' || character === '\u0003') {
        log('[watch] quitting');
        stop();
        return;
      }

      if (character === 'r') {
        nameFilter = undefined;
        log('[watch] rerunning all tests');
        rerunAll();
        continue;
      }

      if (character === '/') {
        filterDraft = '';
        log('[watch] filter (Enter to apply, Esc to cancel): ');
        continue;
      }

      if (character === 'c' && nameFilter !== undefined) {
        nameFilter = undefined;
        log('[watch] filter cleared');
        rerunAll();
      }
    }
  };

  const processPending = async (): Promise<void> => {
    if (busy || closed) {
      return;
    }

    busy = true;

    try {
      const changed = new Set(pending);
      pending.clear();

      const discovered = await discover();
      const currentByNormalized = new Map(
        discovered.map((file) => [normalizeWatchPath(file), file]),
      );
      const previous = new Set(
        currentTests.map((file) => normalizeWatchPath(file)),
      );
      const current = new Set(currentByNormalized.keys());
      const added = [...current].filter((file) => !previous.has(file));
      const removed = [...previous].filter((file) => !current.has(file));

      let affected = affectedTests(graph, changed);
      affected = affected.filter((file) => current.has(file));

      for (const addedTest of added) {
        if (!affected.includes(addedTest)) {
          affected.push(addedTest);
        }
      }

      affected.sort();

      if (affected.length === 0) {
        if (changed.size > 0) {
          const labels = [...changed].map((file) => displayPath(cwd, file));
          log(`[watch] no tests affected by: ${labels.join(', ')}`);
        }

        if (added.length > 0 || removed.length > 0) {
          currentTests = discovered;
          graph = await collectDependencies(currentTests);
        }

        return;
      }

      const runSet = affected
        .map((file) => currentByNormalized.get(file))
        .filter((file): file is string => file !== undefined);

      currentTests = discovered;
      await runFiles(runSet);
      graph = await collectDependencies(currentTests);
    } catch (caught) {
      error(
        `[watch] ${caught instanceof Error ? (caught.stack ?? caught.message) : String(caught)}\n`,
      );
    } finally {
      busy = false;

      if (pending.size > 0 && !closed) {
        schedule(0);
      }
    }
  };

  currentTests = await discover();
  graph = await collectDependencies(currentTests);

  if (currentTests.length === 0) {
    log('[watch] no test files found yet');
  } else {
    try {
      await runFiles(currentTests);
    } catch (caught) {
      error(
        `[watch] ${caught instanceof Error ? (caught.stack ?? caught.message) : String(caught)}\n`,
      );
    }
  }

  log(`[watch] watching ${displayPath(cwd, cwd) || '.'} for changes`);
  log('[watch] waiting for file changes');

  await new Promise<void>((resolve) => {
    resolveStop = resolve;

    stop = (): void => {
      if (closed) {
        return;
      }

      closed = true;

      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }

      watcher?.close();
      options.signal?.removeEventListener('abort', stop);
      detachInput();
      resolveStop?.();
    };

    if (options.signal?.aborted === true) {
      stop();
      return;
    }

    options.signal?.addEventListener('abort', stop, { once: true });

    try {
      watcher = watch(cwd, { recursive: true }, (_eventType, fileName) => {
        if (closed) {
          return;
        }

        if (fileName === null) {
          for (const testFile of currentTests) {
            pending.add(normalizeWatchPath(testFile));
          }

          schedule(debounceMs);
          return;
        }

        const changedPath = path.resolve(cwd, fileName.toString());
        const relative = path.relative(cwd, changedPath);

        if (shouldIgnore(relative)) {
          return;
        }

        pending.add(normalizeWatchPath(changedPath));
        schedule(debounceMs);
      });
      watcher.on('error', (caught) => {
        error(`[watch] watcher error: ${caught.message}\n`);
      });

      const input =
        options.input ?? (process.stdin.isTTY ? process.stdin : undefined);

      if (input !== undefined) {
        const tty = input as Readable & {
          isTTY?: boolean;
          setRawMode?: (mode: boolean) => void;
        };
        let restoreRawMode: (() => void) | undefined;

        if (typeof tty.setRawMode === 'function') {
          tty.setRawMode(true);
          restoreRawMode = (): void => {
            tty.setRawMode?.(false);
          };
        }

        const onData = (chunk: Buffer | string): void => {
          if (!closed) {
            processInput(chunk.toString());
          }
        };

        input.resume();
        input.on('data', onData);
        detachInput = (): void => {
          input.off('data', onData);
          restoreRawMode?.();
          restoreRawMode = undefined;
          input.pause();
        };

        log('[watch] keys: r rerun, / filter, c clear filter, q quit');
      }
    } catch (caught) {
      error(
        `[watch] failed to watch ${cwd}: ${
          caught instanceof Error ? caught.message : String(caught)
        }\n`,
      );
      stop();
    }
  });

  while (busy) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
