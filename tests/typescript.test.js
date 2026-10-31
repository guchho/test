import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  const directory = await mkdtemp(path.join(tmpdir(), 'guchho-ts-'));

  try {
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const fixtures = [
  'basic.fixture.ts',
  'basic.fixture.mts',
  'basic.fixture.cts',
  'component.fixture.tsx',
  'component.fixture.jsx',
];

for (const fixture of fixtures) {
  test(`executes ${fixture}`, async () => {
    const result = await runCli([
      'run',
      `tests/fixtures/typescript/${fixture}`,
    ]);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /1 passed|2 passed/);
    assert.equal(result.stderr, '');
  });
}

test('reports TypeScript syntax errors as load errors', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'broken.test.ts'),
      `import { it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('broken', () => {\n" +
        '  const value: = 1;\n' +
        '});\n',
    );

    const result = await runCli(['run', 'broken.test.ts'], { cwd: directory });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /Failed to load test file/);
    assert.match(result.stderr, /broken\.test\.ts/);
  });
});

test('maps stack traces back to the original TypeScript source', async () => {
  const result = await runCli([
    'run',
    'tests/fixtures/typescript/sourcemap.fixture.ts',
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /mapped boom 1/);
  assert.match(result.stdout, /sourcemap\.fixture\.ts:6:/);
});

test('loads TypeScript test files through the loader', async () => {
  const result = await runCli(['run', 'tests/fixtures/typescript/basic.fixture.ts']);
  assert.match(result.stdout, /✓ typescript > runs \.ts test files/);
});

test('discovers and runs TypeScript tests using config include patterns', async () => {
  await withTempDirectory(async (directory) => {
    await mkdir(path.join(directory, 'checks'), { recursive: true });
    await writeFile(
      path.join(directory, 'guchho.test.config.ts'),
      `import { defineConfig } from ${JSON.stringify(distIndexUrl)};\n` +
        'export default defineConfig({\n' +
        "  include: ['checks/**/*.check.ts'],\n" +
        '  timeout: 1000,\n' +
        '});\n',
    );
    await writeFile(
      path.join(directory, 'checks', 'discovered.check.ts'),
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('discovered TypeScript test', () => {\n" +
        '  const value: number = 3;\n' +
        '  expect(value).toBe(3);\n' +
        '});\n',
    );

    const result = await runCli([], { cwd: directory });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /checks\/discovered\.check\.ts/);
    assert.match(result.stdout, /✓ discovered TypeScript test/);
  });
});

test('generated declarations exist for public entry points', async () => {
  const declarations = [
    'dist/index.d.ts',
    'dist/config/index.d.ts',
    'dist/transform/typescript.d.ts',
  ];

  for (const file of declarations) {
    const contents = await readFile(path.join(repoRoot, file), 'utf8');
    assert.ok(contents.length > 0, `${file} should not be empty`);
  }

  const packageJson = JSON.parse(
    await readFile(path.join(repoRoot, 'package.json'), 'utf8'),
  );
  assert.equal(packageJson.exports['.'].types, './dist/index.d.ts');
  assert.equal(
    packageJson.exports['./config'].types,
    './dist/config/index.d.ts',
  );
});
