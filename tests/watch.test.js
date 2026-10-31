import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  affectedTests,
  collectDependencies,
  normalizeWatchPath,
} from '../dist/watch/dependencies.js';
import { watchTests } from '../dist/watch/watcher.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const distIndexUrl = pathToFileURL(path.join(repoRoot, 'dist', 'index.js')).href;

async function withTempDirectory(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), 'guchho-watch-'));

  try {
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function waitFor(predicate, timeout = 8000) {
  const started = Date.now();

  while (Date.now() - started < timeout) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for condition.');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('collects dependencies and resolves TypeScript import specifiers', async () => {
  await withTempDirectory(async (directory) => {
    const testFile = path.join(directory, 'sample.test.ts');
    const dependency = path.join(directory, 'value.ts');

    await writeFile(
      testFile,
      `import { value } from './value.js';\nexport const used = value;\n`,
    );
    await writeFile(dependency, 'export const value = 1;\n');

    const graph = await collectDependencies([testFile]);
    const dependencies = graph.get(normalizeWatchPath(testFile));

    assert.ok(dependencies);
    assert.ok(dependencies.has(normalizeWatchPath(dependency)));

    const affected = affectedTests(
      graph,
      new Set([normalizeWatchPath(dependency)]),
    );
    assert.deepEqual(affected, [normalizeWatchPath(testFile)]);
  });
});

test('watch mode reruns affected tests once per debounced change', async () => {
  await withTempDirectory(async (directory) => {
    const testFile = path.join(directory, 'math.test.js');
    const dependency = path.join(directory, 'math.js');
    const runs = [];
    const logs = [];
    const controller = new AbortController();

    await writeFile(dependency, 'export function value() { return 1; }\n');
    await writeFile(
      testFile,
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "import { value } from './math.js';\n" +
        "it('uses dependency', () => { expect(value()).toBe(1); });\n",
    );

    const watching = watchTests({
      cwd: directory,
      include: ['**/*.test.js'],
      exclude: ['**/node_modules/**'],
      debounceMs: 80,
      signal: controller.signal,
      log: (text) => {
        logs.push(text);
      },
      error: (text) => {
        logs.push(text);
      },
      run: async (files) => {
        runs.push([...files]);
        return { success: true };
      },
    });

    await waitFor(() => runs.length === 1);
    assert.deepEqual(runs[0], [testFile]);

    await writeFile(dependency, 'export function value() { return 2; }\n');
    await waitFor(() => runs.length >= 2);
    assert.deepEqual(runs[1], [testFile]);

    await delay(500);
    assert.equal(runs.length, 2, 'duplicate runs should be coalesced');

    await writeFile(path.join(directory, 'notes.txt'), 'unrelated\n');
    await delay(400);
    assert.equal(runs.length, 2, 'unrelated changes must not rerun tests');

    const extraTest = path.join(directory, 'extra.test.js');
    await writeFile(
      extraTest,
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('extra', () => { expect(true).toBe(true); });\n",
    );
    await waitFor(() => runs.length === 3);
    assert.deepEqual(runs[2], [extraTest]);

    controller.abort();
    await watching;

    assert.ok(logs.some((line) => line.includes('watching')));
    assert.ok(logs.some((line) => line.includes('run completed successfully')));
  });
});

test('watch mode discovers tests added to an initially empty project', async () => {
  await withTempDirectory(async (directory) => {
    const runs = [];
    const logs = [];
    const controller = new AbortController();

    const watching = watchTests({
      cwd: directory,
      include: ['**/*.test.js'],
      exclude: ['**/node_modules/**'],
      debounceMs: 50,
      signal: controller.signal,
      log: (text) => {
        logs.push(text);
      },
      error: (text) => {
        logs.push(text);
      },
      run: async (files) => {
        runs.push([...files]);
        return { success: true };
      },
    });

    await waitFor(() =>
      logs.some((line) => line.includes('no test files found yet')),
    );

    const testFile = path.join(directory, 'added.test.js');
    await writeFile(
      testFile,
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('added later', () => { expect(true).toBe(true); });\n",
    );

    await waitFor(() => runs.length === 1);
    assert.deepEqual(runs[0], [testFile]);

    controller.abort();
    await watching;
  });
});

test('watch mode ignores events inside excluded directories', async () => {
  await withTempDirectory(async (directory) => {
    const runs = [];
    const controller = new AbortController();
    const ignored = path.join(directory, 'node_modules', 'pkg');

    await mkdir(ignored, { recursive: true });
    await writeFile(
      path.join(directory, 'basic.test.js'),
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('basic', () => { expect(true).toBe(true); });\n",
    );

    const watching = watchTests({
      cwd: directory,
      include: ['**/*.test.js'],
      exclude: ['**/node_modules/**'],
      debounceMs: 50,
      signal: controller.signal,
      log: () => {},
      error: () => {},
      run: async (files) => {
        runs.push([...files]);
        return { success: true };
      },
    });

    await waitFor(() => runs.length === 1);
    await writeFile(path.join(ignored, 'noise.js'), 'export {};\n');
    await delay(400);
    assert.equal(runs.length, 1);

    controller.abort();
    await watching;
  });
});
