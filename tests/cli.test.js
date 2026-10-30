import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

test('prints version and help', async () => {
  const version = await runCli(['--version']);
  assert.equal(version.code, 0);
  assert.match(version.stdout, /^\d+\.\d+\.\d+\n$/);

  const help = await runCli(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage: guchho-test/);
  assert.match(help.stdout, /--filter/);
});

test('rejects unknown options with exit code 2', async () => {
  const result = await runCli(['--nope']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unknown option: --nope/);
});

test('runs a passing fixture and reports all statuses', async () => {
  const result = await runCli(['run', 'tests/fixtures/passing.fixture.js']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /math > adds two numbers/);
  assert.match(result.stdout, /math > supports async tests/);
  assert.match(result.stdout, /math > nested > runs nested tests/);
  assert.match(result.stdout, /- math > is skipped \(skipped\)/);
  assert.match(result.stdout, /○ math > is a todo \(todo\)/);
  assert.match(
    result.stdout,
    /Tests: 3 passed, 0 failed, 1 skipped, 1 todo/,
  );
  assert.equal(result.stderr, '');
});

test('reports synchronous and asynchronous failures with exit code 1', async () => {
  const result = await runCli(['run', 'tests/fixtures/failing.fixture.js']);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /✗ failures > throws synchronously/);
  assert.match(result.stdout, /sync boom/);
  assert.match(result.stdout, /✗ failures > rejects asynchronously/);
  assert.match(result.stdout, /async boom/);
  assert.match(
    result.stdout,
    /Tests: 1 passed, 2 failed, 0 skipped, 0 todo/,
  );
});

test('applies only, skip, and todo selection', async () => {
  const result = await runCli(['run', 'tests/fixtures/modes.fixture.js']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /✓ focused test/);
  assert.match(result.stdout, /✓ focused suite > runs focused child/);
  assert.doesNotMatch(result.stdout, /Only the focused tests should run/);
  assert.match(
    result.stdout,
    /Tests: 2 passed, 0 failed, 4 skipped, 1 todo/,
  );
});

test('runs assertion matchers through the CLI', async () => {
  const result = await runCli(['run', 'tests/fixtures/assertions.fixture.js']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /assertions > passes synchronous matcher checks/);
  assert.match(result.stdout, /assertions > passes asynchronous matcher checks/);
  assert.match(
    result.stdout,
    /Tests: 2 passed, 0 failed, 0 skipped, 0 todo/,
  );
});

test('reports assertion diagnostics through the CLI', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/assertion-failure.fixture.js',
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /AssertionError/);
  assert.match(result.stdout, /toStrictEqual|toEqual/);
  assert.match(result.stdout, /Expected:/);
  assert.match(result.stdout, /Received:/);
  assert.match(result.stdout, /Difference/);
});

test('fails a test that exceeds its timeout', async () => {
  const result = await runCli(['run', 'tests/fixtures/timeout.fixture.js']);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /timed out after 10ms/);
  assert.match(
    result.stdout,
    /Tests: 0 passed, 1 failed, 0 skipped, 0 todo/,
  );
});

test('reports module load errors with exit code 2', async () => {
  const result = await runCli(['run', 'tests/fixtures/load-error.fixture.js']);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /Failed to load test file/);
  assert.match(result.stderr, /fixture load failure/);
});

test('rejects missing files with exit code 2', async () => {
  const result = await runCli(['run', 'tests/fixtures/missing.fixture.js']);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /Test file not found/);
});

test('filters tests by name', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/passing.fixture.js',
    '--filter=nested',
  ]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /math > nested > runs nested tests/);
  assert.doesNotMatch(result.stdout, /math > adds two numbers/);
  assert.match(
    result.stdout,
    /Tests: 1 passed, 0 failed, 0 skipped, 0 todo/,
  );
});

test('discovers test files in the working directory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'guchho-test-'));

  try {
    await writeFile(
      path.join(directory, 'example.test.js'),
      `import { it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('discovered test', () => {});\n",
    );

    const result = await runCli([], { cwd: directory });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /example\.test\.js/);
    assert.match(result.stdout, /✓ discovered test/);
    assert.match(
      result.stdout,
      /Tests: 1 passed, 0 failed, 0 skipped, 0 todo/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fails when no test files are found', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'guchho-test-'));

  try {
    const result = await runCli([], { cwd: directory });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /No test files found/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
