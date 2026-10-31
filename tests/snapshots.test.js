import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const cliPath = path.join(repoRoot, 'dist', 'cli', 'index.js');
const distIndexUrl = pathToFileURL(path.join(repoRoot, 'dist', 'index.js')).href;

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: options.cwd ?? repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function withTempDirectory(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), 'guchho-snapshot-'));

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

test('creates, compares, and updates external snapshots', async () => {
  await withTempDirectory(async (directory) => {
    const testFile = path.join(directory, 'tests', 'snap.test.js');
    const snapshotFile = path.join(
      directory,
      'tests',
      '__snapshots__',
      'snap.test.js.snap',
    );

    await writeFile(
      testFile,
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('stores values', () => {\n" +
        "  expect({ b: 2, a: 1 }).toMatchSnapshot();\n" +
        '});\n',
    );

    let result = await runCli(['run', 'tests/snap.test.js'], { cwd: directory });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /does not exist/);
    assert.match(result.stdout, /--update/);

    result = await runCli(
      ['run', 'tests/snap.test.js', '--update'],
      { cwd: directory },
    );
    assert.equal(result.code, 0, result.stderr);

    const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
    assert.deepEqual(Object.keys(snapshot), ['stores values 1']);
    assert.match(snapshot['stores values 1'], /a: 1/);
    assert.match(snapshot['stores values 1'], /b: 2/);

    result = await runCli(['run', 'tests/snap.test.js'], { cwd: directory });
    assert.equal(result.code, 0, result.stderr);

    await writeFile(
      testFile,
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('stores values', () => {\n" +
        "  expect({ b: 3, a: 1 }).toMatchSnapshot();\n" +
        '});\n',
    );

    result = await runCli(['run', 'tests/snap.test.js'], { cwd: directory });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /Snapshot name: stores values 1/);
    assert.match(result.stdout, /Difference/);

    result = await runCli(
      ['run', 'tests/snap.test.js', '--update'],
      { cwd: directory },
    );
    assert.equal(result.code, 0, result.stderr);

    const updated = JSON.parse(await readFile(snapshotFile, 'utf8'));
    assert.match(updated['stores values 1'], /b: 3/);
  });
});

test('writes inline snapshots in TypeScript test files', async () => {
  await withTempDirectory(async (directory) => {
    const testFile = path.join(directory, 'tests', 'inline.test.ts');
    await writeFile(
      testFile,
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('writes inline snapshots', () => {\n" +
        '  expect({ value: 1 }).toMatchInlineSnapshot();\n' +
        '});\n',
    );

    let result = await runCli(
      ['run', 'tests/inline.test.ts', '--update'],
      { cwd: directory },
    );
    assert.equal(result.code, 0, result.stderr);

    const source = await readFile(testFile, 'utf8');
    assert.match(source, /toMatchInlineSnapshot\("/);
    assert.match(source, /value: 1/);

    result = await runCli(['run', 'tests/inline.test.ts'], { cwd: directory });
    assert.equal(result.code, 0, result.stderr);
  });
});
