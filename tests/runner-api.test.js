import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runTests } from '../dist/index.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const distIndexUrl = pathToFileURL(
  path.join(repoRoot, 'dist', 'index.js'),
).href;

async function withTempDirectory(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), 'guchho-api-'));

  try {
    await writeFile(
      path.join(directory, 'package.json'),
      '{"type":"module"}\n',
    );
    await mkdir(path.join(directory, 'tests'), { recursive: true });
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('runs test files in-process and returns results', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'tests', 'api.test.js'),
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('passes in-process', () => {\n" +
        '  expect(1 + 1).toBe(2);\n' +
        '});\n' +
        "it.skip('can be skipped', () => {\n" +
        '  expect(true).toBe(true);\n' +
        '});\n',
    );

    const result = await runTests({
      cwd: directory,
      files: ['tests/api.test.js'],
    });

    assert.equal(result.success, true);
    assert.equal(result.files.length, 1);
    assert.equal(
      result.files[0].file,
      path.join(directory, 'tests', 'api.test.js'),
    );
    assert.equal(result.files[0].testCount, 2);
    assert.deepEqual(result.summary, {
      total: 2,
      passed: 1,
      failed: 0,
      skipped: 1,
      todo: 0,
    });
  });
});

test('supports Jest-compatible globals in-process', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'tests', 'globals.test.js'),
      "it('uses globals', () => {\n" +
        '  expect(2 * 3).toBe(6);\n' +
        '  const spy = jest.fn(() => 1);\n' +
        '  spy();\n' +
        '  expect(spy).toHaveBeenCalledTimes(1);\n' +
        '});\n',
    );

    const result = await runTests({
      cwd: directory,
      files: ['tests/globals.test.js'],
      globals: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.summary.passed, 1);
    assert.equal(globalThis.it, undefined);
    assert.equal(globalThis.expect, undefined);
  });
});

test('runs setup files and global hooks in-process', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'setup.js'),
      'globalThis.__guchhoSetup = (globalThis.__guchhoSetup ?? 0) + 1;\n',
    );
    await writeFile(
      path.join(directory, 'global-setup.js'),
      "import { writeFile } from 'node:fs/promises';\n" +
        'export default async function setup({ cwd }) {\n' +
        "  await writeFile(new URL('global.txt', import.meta.url), cwd);\n" +
        '}\n',
    );
    await writeFile(
      path.join(directory, 'global-teardown.js'),
      "import { appendFile } from 'node:fs/promises';\n" +
        'export async function teardown() {\n' +
        "  await appendFile(new URL('global.txt', import.meta.url), ':done');\n" +
        '}\n',
    );
    await writeFile(
      path.join(directory, 'tests', 'setup.test.js'),
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "import { readFile } from 'node:fs/promises';\n" +
        "it('uses setup files and global hooks', async () => {\n" +
        '  expect(globalThis.__guchhoSetup).toBe(1);\n' +
        "  const marker = await readFile(new URL('../global.txt', import.meta.url), 'utf8');\n" +
        `  expect(marker).toBe(${JSON.stringify(directory)});\n` +
        '});\n',
    );

    const result = await runTests({
      cwd: directory,
      files: ['tests/setup.test.js'],
      setupFiles: ['setup.js'],
      globalSetup: 'global-setup.js',
      globalTeardown: 'global-teardown.js',
    });

    assert.equal(result.success, true);
    const marker = await readFile(path.join(directory, 'global.txt'), 'utf8');
    assert.equal(marker, `${directory}:done`);
  });
});

test('updates inline snapshots in-process', async () => {
  await withTempDirectory(async (directory) => {
    const testFile = path.join(directory, 'tests', 'inline.test.js');
    await writeFile(
      testFile,
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('inline in-process', () => {\n" +
        '  expect({ value: 1 }).toMatchInlineSnapshot();\n' +
        '});\n',
    );

    let result = await runTests({
      cwd: directory,
      files: ['tests/inline.test.js'],
      updateSnapshots: true,
    });
    assert.equal(result.success, true);

    const source = await readFile(testFile, 'utf8');
    assert.match(source, /toMatchInlineSnapshot\("/);
    assert.match(source, /value: 1/);

    result = await runTests({
      cwd: directory,
      files: ['tests/inline.test.js'],
    });
    assert.equal(result.success, true);
  });
});

test('validates the files option', async () => {
  await assert.rejects(runTests({ files: [] }), /non-empty array/);
  await assert.rejects(runTests({}), /non-empty array/);
});
