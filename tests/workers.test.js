import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const cliPath = path.join(repoRoot, 'dist', 'cli', 'index.js');

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

test('runs multiple files with worker threads in deterministic order', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/parallel/first.fixture.js',
    'tests/fixtures/parallel/second.fixture.js',
    '--maxWorkers=2',
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /first\.fixture\.js/);
  assert.match(result.stdout, /second\.fixture\.js/);
  assert.ok(
    result.stdout.indexOf('first.fixture.js') <
      result.stdout.indexOf('second.fixture.js'),
  );
  assert.equal(
    result.stdout.match(/runs in the first file/g)?.length,
    1,
  );
  assert.equal(
    result.stdout.match(/runs in the second file/g)?.length,
    1,
  );
  assert.match(result.stdout, /Overall/);
  assert.match(result.stdout, /Tests: 2 passed, 0 failed/);
});

test('supports the fork execution pool', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/parallel/first.fixture.js',
    'tests/fixtures/parallel/second.fixture.js',
    '--pool=forks',
    '--maxWorkers=2',
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /✓ runs in the first file/);
  assert.match(result.stdout, /✓ runs in the second file/);
  assert.match(result.stdout, /Tests: 2 passed, 0 failed/);
});

test('bail stops after the first failing test', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/bail.fixture.js',
    '--bail',
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /✗ fails first/);
  assert.doesNotMatch(result.stdout, /SECOND_TEST_RAN/);
  assert.doesNotMatch(result.stdout, /would run later/);
  assert.match(result.stdout, /Tests: 0 passed, 1 failed/);
});

test('bail stops before running later files', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/bail.fixture.js',
    'tests/fixtures/parallel/first.fixture.js',
    '--bail',
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /✗ fails first/);
  assert.doesNotMatch(result.stdout, /runs in the first file/);
});

test('reports worker failures as execution errors', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/worker-crash.fixture.js',
  ]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /Failed while executing/);
  assert.match(result.stderr, /exited unexpectedly with code 1/);
});

test('validates worker options', async () => {
  const invalidWorkers = await runCli([
    'run',
    'tests/fixtures/passing.fixture.js',
    '--maxWorkers=0',
  ]);
  assert.equal(invalidWorkers.code, 2);
  assert.match(invalidWorkers.stderr, /positive integer/);

  const fractionalWorkers = await runCli([
    'run',
    'tests/fixtures/passing.fixture.js',
    '--maxWorkers=1.5',
  ]);
  assert.equal(fractionalWorkers.code, 2);
  assert.match(fractionalWorkers.stderr, /positive integer/);

  const invalidPool = await runCli([
    'run',
    'tests/fixtures/passing.fixture.js',
    '--pool=unknown',
  ]);
  assert.equal(invalidPool.code, 2);
  assert.match(invalidPool.stderr, /Unknown pool: unknown/);
});
