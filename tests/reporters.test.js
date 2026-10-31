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

test('json reporter emits parseable machine-readable output', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/passing.fixture.js',
    'tests/fixtures/assertions.fixture.js',
    '--reporter=json',
  ]);

  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.equal(report.success, true);
  assert.equal(report.summary.total, 7);
  assert.equal(report.summary.passed, 5);
  assert.equal(report.summary.skipped, 1);
  assert.equal(report.summary.todo, 1);
  assert.equal(report.files.length, 2);
  assert.equal(report.files[0].file, 'tests/fixtures/passing.fixture.js');
  assert.equal(report.files[1].file, 'tests/fixtures/assertions.fixture.js');
  assert.equal(report.files[0].results[0].status, 'passed');
});

test('json reporter includes failure details', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/failing.fixture.js',
    '--reporter=json',
  ]);

  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  const failed = report.files[0].results.filter(
    (entry) => entry.status === 'failed',
  );

  assert.equal(failed.length, 2);
  assert.equal(failed[0].error.isError, true);
  assert.match(failed[0].error.message, /sync boom/);
  assert.match(failed[0].error.stack, /failing\.fixture\.js/);
});

test('dot reporter prints compact status symbols', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/passing.fixture.js',
    '--reporter=dot',
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /\.\.\.ST/);
  assert.doesNotMatch(result.stdout, /✓/);
  assert.match(result.stdout, /Tests: 3 passed, 0 failed, 1 skipped, 1 todo/);
});

test('dot reporter prints failures once with diagnostics', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/failing.fixture.js',
    '--reporter=dot',
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /FF/);
  assert.match(result.stdout, /Failures:/);
  assert.equal(
    result.stdout.match(/✗ failures > throws synchronously/g)?.length,
    1,
  );
});

test('verbose reporter includes status labels and names', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/passing.fixture.js',
    '--reporter=verbose',
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /PASS\s+math > adds two numbers/);
  assert.match(result.stdout, /SKIP\s+math > is skipped/);
  assert.match(result.stdout, /TODO\s+math > is a todo/);
});

test('rejects unknown reporters', async () => {
  const unknown = await runCli([
    'run',
    'tests/fixtures/passing.fixture.js',
    '--reporter=unknown',
  ]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown reporter: unknown/);
});

test('junit reporter emits XML results', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/passing.fixture.js',
    '--reporter=junit',
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    result.stdout,
    /^<\?xml version="1\.0" encoding="UTF-8"\?>/,
  );
  assert.match(result.stdout, /<testsuites[^>]*tests="5"[^>]*skipped="2"/);
  assert.match(
    result.stdout,
    /<testcase classname="tests\/fixtures\/passing\.fixture\.js"/,
  );
  assert.match(result.stdout, /<skipped message="skipped"\/>/);
  assert.match(result.stdout, /<skipped message="todo"\/>/);
});

test('junit reporter records failure details', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/failing.fixture.js',
    '--reporter=junit',
  ]);

  assert.equal(result.code, 1);
  assert.match(
    result.stdout,
    /<failure message="Error: sync boom"/,
  );
  assert.match(result.stdout, /failing\.fixture\.js/);
});

test('junit reporter records hook errors', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/hook-failure.fixture.js',
    '--reporter=junit',
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /<error message="Error: hook setup boom" type="HookError"/);
  assert.match(result.stdout, /beforeAll hook/);
  assert.match(result.stdout, /&lt;root&gt;/);
});
