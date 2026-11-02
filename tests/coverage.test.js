import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  access,
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
const distIndexUrl = pathToFileURL(
  path.join(repoRoot, 'dist', 'index.js'),
).href;

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

async function createProject(directory) {
  await writeFile(path.join(directory, 'package.json'), '{"type":"module"}\n');
  await mkdir(path.join(directory, 'src'), { recursive: true });
  await mkdir(path.join(directory, 'tests'), { recursive: true });
  await writeFile(
    path.join(directory, 'src', 'math.ts'),
    [
      'export function add(a: number, b: number): number {',
      '  return a + b;',
      '}',
      '',
      'export function unused(a: number): number {',
      '  return a * 2;',
      '}',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(directory, 'tests', 'math.test.js'),
    `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
      "import { add } from '../src/math.ts';\n" +
      "it('adds', () => { expect(add(1, 2)).toBe(3); });\n",
  );
}

async function withTempDirectory(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), 'guchho-coverage-'));

  try {
    await createProject(directory);
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('collects V8 coverage with source maps and writes reports', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'guchho.test.config.js'),
      'export default {\n' +
        "  coverage: { enabled: true, reporter: ['text', 'html', 'json'] },\n" +
        '};\n',
    );

    const result = await runCli(['run', 'tests/math.test.js'], {
      cwd: directory,
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Coverage summary/);
    assert.match(result.stdout, /src\/math\.ts/);
    await access(path.join(directory, 'coverage', 'index.html'));

    const report = JSON.parse(
      await readFile(path.join(directory, 'coverage', 'coverage.json'), 'utf8'),
    );

    const file = report.files.find((entry) => entry.path === 'src/math.ts');
    assert.ok(file);
    assert.equal(file.lineHits['2'], true);
    assert.equal(file.lineHits['6'], false);
    assert.ok(file.lines.covered < file.lines.total);
    assert.equal(file.functions.total, 2);
    assert.equal(file.functions.covered, 1);
    assert.ok(!report.files.some((entry) => entry.path.includes('tests/')));
  });
});

test('fails the run when coverage thresholds are not met', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'guchho.test.config.js'),
      'export default {\n' +
        "  coverage: { enabled: true, reporter: ['json'], thresholds: { lines: 95 } },\n" +
        '};\n',
    );

    const result = await runCli(['run', 'tests/math.test.js'], {
      cwd: directory,
    });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /Coverage thresholds not met/);
    assert.match(result.stderr, /lines: .* is below 95\.00%/);
  });
});

test('enables coverage from the CLI', async () => {
  await withTempDirectory(async (directory) => {
    const result = await runCli(['run', 'tests/math.test.js', '--coverage'], {
      cwd: directory,
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Coverage summary/);
    await access(path.join(directory, 'coverage', 'index.html'));
  });
});

test('writes lcov and cobertura coverage reports', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'guchho.test.config.js'),
      'export default {\n' +
        "  coverage: { enabled: true, reporter: ['lcov', 'cobertura'] },\n" +
        '};\n',
    );

    const result = await runCli(['run', 'tests/math.test.js'], {
      cwd: directory,
    });

    assert.equal(result.code, 0, result.stderr);

    const lcov = await readFile(
      path.join(directory, 'coverage', 'lcov.info'),
      'utf8',
    );
    assert.match(lcov, /^TN:$/m);
    assert.match(lcov, /^SF:src\/math\.ts$/m);
    assert.match(lcov, /^DA:2,1$/m);
    assert.match(lcov, /^DA:6,0$/m);
    assert.match(lcov, /^end_of_record$/m);

    const cobertura = await readFile(
      path.join(directory, 'coverage', 'cobertura-coverage.xml'),
      'utf8',
    );
    assert.match(cobertura, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(cobertura, /<coverage [^>]*lines-valid="/);
    assert.match(
      cobertura,
      /<class name="src\/math\.ts" filename="src\/math\.ts"/,
    );
    assert.match(cobertura, /<line number="2" hits="1"\/>/);
  });
});

test('applies coverage thresholds per file', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'guchho.test.config.js'),
      'export default {\n' +
        "  coverage: { enabled: true, reporter: ['json'], thresholds: { lines: 100, perFile: true } },\n" +
        '};\n',
    );

    const result = await runCli(['run', 'tests/math.test.js'], {
      cwd: directory,
    });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /Coverage thresholds not met/);
    assert.match(result.stderr, /src\/math\.ts: lines: .* is below 100\.00%/);
  });
});
