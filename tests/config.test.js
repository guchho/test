import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ConfigError,
  discoverConfigFile,
  loadConfig,
  resolveConfig,
  validateConfig,
} from '../dist/config/load.js';
import {
  defaultExclude,
  defaultInclude,
  defaultTimeout,
} from '../dist/config/defaults.js';

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
  const directory = await mkdtemp(path.join(tmpdir(), 'guchho-config-'));

  try {
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function testFileSource(name) {
  return (
    `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
    `it(${JSON.stringify(name)}, () => {\n` +
    '  expect(true).toBe(true);\n' +
    '});\n'
  );
}

test('validateConfig accepts a complete configuration', () => {
  const config = validateConfig(
    {
      include: ['src/**/*.test.ts'],
      exclude: ['dist/**'],
      timeout: 1000,
      reporters: ['default', ['json', { output: 'results.json' }]],
      plugins: ['./plugin.js'],
      setupFiles: ['./setup.js'],
      setupFilesAfterEnv: ['./setup-after.js'],
      coverage: {
        enabled: true,
        reportsDirectory: 'reports/coverage',
        provider: 'v8',
        reporter: ['text', 'html'],
        thresholds: { lines: 80, branches: 70 },
      },
    },
    'config.json',
  );

  assert.deepEqual(config, {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**'],
    timeout: 1000,
    reporters: ['default', ['json', { output: 'results.json' }]],
    plugins: ['./plugin.js'],
    setupFiles: ['./setup.js'],
    setupFilesAfterEnv: ['./setup-after.js'],
    coverage: {
      enabled: true,
      reportsDirectory: 'reports/coverage',
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 80, branches: 70 },
    },
  });
});

test('validateConfig rejects unknown and malformed options', () => {
  assert.throws(
    () => validateConfig({ unknown: true }, 'config.json'),
    /unknown configuration option "unknown"/,
  );
  assert.throws(
    () => validateConfig({ include: 'src' }, 'config.json'),
    /"include" must be an array of strings/,
  );
  assert.throws(
    () => validateConfig({ include: [''] }, 'config.json'),
    /non-empty strings/,
  );
  assert.throws(
    () => validateConfig({ timeout: 0 }, 'config.json'),
    /"timeout" must be a positive, finite number/,
  );
  assert.throws(
    () => validateConfig({ reporters: ['nope'] }, 'config.json'),
    /unknown reporter "nope"/,
  );
  assert.throws(
    () => validateConfig({ coverage: { enabled: 'yes' } }, 'config.json'),
    /"coverage.enabled" must be a boolean/,
  );
  assert.throws(
    () => validateConfig({ coverage: { provider: 'istanbul' } }, 'config.json'),
    /"coverage.provider" must be "v8"/,
  );
  assert.throws(
    () => validateConfig({ coverage: { reporter: ['xml'] } }, 'config.json'),
    /unknown coverage reporter "xml"/,
  );
  assert.throws(
    () => validateConfig({ plugins: 'plugin.js' }, 'config.json'),
    /"plugins" must be an array of strings/,
  );
  assert.throws(
    () => validateConfig({ setupFiles: 'setup.js' }, 'config.json'),
    /"setupFiles" must be an array of strings/,
  );
  assert.throws(
    () => validateConfig({ setupFiles: [''] }, 'config.json'),
    /non-empty strings/,
  );
  assert.throws(
    () => validateConfig({ setupFilesAfterEnv: [42] }, 'config.json'),
    /"setupFilesAfterEnv" must only contain non-empty strings/,
  );
  assert.throws(
    () => validateConfig({ coverage: { thresholds: { lines: -1 } } }, 'config.json'),
    /coverage threshold "lines" must be a non-negative number/,
  );
  assert.throws(
    () => validateConfig([], 'config.json'),
    ConfigError,
  );

  const custom = validateConfig(
    { plugins: ['./plugin.js'], reporters: ['custom'] },
    'config.json',
  );
  assert.deepEqual(custom.reporters, ['custom']);
  assert.deepEqual(custom.plugins, ['./plugin.js']);
});

test('resolveConfig applies defaults and config precedence', () => {
  const defaults = resolveConfig(undefined);
  assert.deepEqual([...defaults.include], [...defaultInclude]);
  assert.deepEqual([...defaults.exclude], [...defaultExclude]);
  assert.equal(defaults.timeout, defaultTimeout);
  assert.deepEqual([...defaults.reporters], ['default']);
  assert.equal(defaults.coverage.enabled, false);
  assert.deepEqual([...defaults.plugins], []);
  assert.deepEqual([...defaults.setupFiles], []);
  assert.deepEqual([...defaults.setupFilesAfterEnv], []);
  assert.equal(defaults.coverage.reportsDirectory, 'coverage');

  const configured = resolveConfig({
    path: 'config.json',
    config: {
      include: ['custom/**/*.ts'],
      timeout: 250,
    },
  });
  assert.deepEqual([...configured.include], ['custom/**/*.ts']);
  assert.equal(configured.timeout, 250);

  const overridden = resolveConfig(
    { path: 'config.json', config: { timeout: 250 } },
    { timeout: 900 },
  );
  assert.equal(overridden.timeout, 900);
});

test('discovers the nearest configuration file', async () => {
  await withTempDirectory(async (directory) => {
    await mkdir(path.join(directory, 'nested', 'deeper'), { recursive: true });
    await writeFile(
      path.join(directory, 'guchho.test.config.json'),
      '{}\n',
    );

    const discovered = await discoverConfigFile(
      path.join(directory, 'nested', 'deeper'),
    );
    assert.equal(discovered, path.join(directory, 'guchho.test.config.json'));
  });
});

test('loads JSON configuration and resolves relative paths', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'custom.json'),
      JSON.stringify({ timeout: 1234 }),
    );

    const loaded = await loadConfig(directory, 'custom.json');
    assert.equal(loaded.path, path.join(directory, 'custom.json'));
    assert.equal(loaded.config.timeout, 1234);
  });
});

test('throws for missing or malformed configuration', async () => {
  await withTempDirectory(async (directory) => {
    await assert.rejects(
      loadConfig(directory, 'missing.json'),
      /Configuration file not found: missing\.json/,
    );

    await writeFile(
      path.join(directory, 'broken.json'),
      '{ not json',
    );
    await assert.rejects(
      loadConfig(directory, 'broken.json'),
      /Failed to parse configuration file/,
    );
  });
});

test('discovers tests using include patterns from configuration', async () => {
  await withTempDirectory(async (directory) => {
    await mkdir(path.join(directory, 'custom'), { recursive: true });
    await writeFile(
      path.join(directory, 'guchho.test.config.json'),
      JSON.stringify({ include: ['custom/**/*.check.js'] }),
    );
    await writeFile(
      path.join(directory, 'custom', 'example.check.js'),
      testFileSource('discovered via config'),
    );

    const result = await runCli([], { cwd: directory });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /custom\/example\.check\.js/);
    assert.match(result.stdout, /✓ discovered via config/);
  });
});

test('honours an explicit --config path instead of discovery', async () => {
  await withTempDirectory(async (directory) => {
    await mkdir(path.join(directory, 'primary'), { recursive: true });
    await mkdir(path.join(directory, 'alternate'), { recursive: true });
    await writeFile(
      path.join(directory, 'guchho.test.config.json'),
      JSON.stringify({ include: ['primary/**/*.check.js'] }),
    );
    await writeFile(
      path.join(directory, 'alternate.config.json'),
      JSON.stringify({ include: ['alternate/**/*.check.js'] }),
    );
    await writeFile(
      path.join(directory, 'primary', 'primary.check.js'),
      testFileSource('primary config test'),
    );
    await writeFile(
      path.join(directory, 'alternate', 'alternate.check.js'),
      testFileSource('alternate config test'),
    );

    const result = await runCli(['--config=alternate.config.json'], {
      cwd: directory,
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /✓ alternate config test/);
    assert.doesNotMatch(result.stdout, /primary config test/);
  });
});

test('CLI timeout overrides configuration and defaults', async () => {
  await withTempDirectory(async (directory) => {
    await mkdir(path.join(directory, 'slow'), { recursive: true });
    await writeFile(
      path.join(directory, 'guchho.test.config.json'),
      JSON.stringify({ include: ['slow/**/*.check.js'], timeout: 20 }),
    );
    await writeFile(
      path.join(directory, 'slow', 'slow.check.js'),
      `import { it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('slow test', async () => {\n" +
        '  await new Promise((resolve) => setTimeout(resolve, 60));\n' +
        '});\n',
    );

    const timedOut = await runCli([], { cwd: directory });
    assert.equal(timedOut.code, 1);
    assert.match(timedOut.stdout, /timed out after 20ms/);

    const overridden = await runCli(['--timeout=1000'], { cwd: directory });
    assert.equal(overridden.code, 0, overridden.stderr);
    assert.match(overridden.stdout, /1 passed/);
  });
});

test('runs setup files before the test file in both pools', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'setup.js'),
      "globalThis.__guchhoSetupOrder = ['setup'];\n",
    );
    await writeFile(
      path.join(directory, 'setup-after.js'),
      "globalThis.__guchhoSetupOrder.push('setupAfterEnv');\n",
    );
    await writeFile(
      path.join(directory, 'example.test.js'),
      `import { expect, it } from ${JSON.stringify(distIndexUrl)};\n` +
        "globalThis.__guchhoSetupOrder.push('test');\n" +
        "it('sees setup files', () => {\n" +
        '  expect(globalThis.__guchhoSetupOrder).toEqual([\n' +
        "    'setup',\n" +
        "    'setupAfterEnv',\n" +
        "    'test',\n" +
        '  ]);\n' +
        '});\n',
    );
    await writeFile(
      path.join(directory, 'guchho.test.config.json'),
      JSON.stringify({
        setupFiles: ['./setup.js'],
        setupFilesAfterEnv: ['./setup-after.js'],
      }),
    );

    for (const pool of ['threads', 'forks']) {
      const result = await runCli([`--pool=${pool}`], { cwd: directory });
      assert.equal(
        result.code,
        0,
        `${pool}: ${result.stderr}${result.stdout}`,
      );
      assert.match(result.stdout, /✓ sees setup files/);
    }
  });
});

test('reports setup file failures with exit code 2', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'example.test.js'),
      testFileSource('never runs'),
    );

    for (const [key, file] of [
      ['setupFiles', 'setup.js'],
      ['setupFilesAfterEnv', 'setup-after.js'],
    ]) {
      await writeFile(
        path.join(directory, file),
        `throw new Error('${key} boom');\n`,
      );
      await writeFile(
        path.join(directory, 'guchho.test.config.json'),
        JSON.stringify({ [key]: [`./${file}`] }),
      );

      const result = await runCli([], { cwd: directory });
      assert.equal(result.code, 2);
      assert.match(result.stderr, /Failed to load setup/);
      assert.match(result.stderr, new RegExp(`${key} boom`));
      assert.doesNotMatch(result.stdout, /never runs/);
    }
  });
});

test('reports configuration errors with exit code 2', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'guchho.test.config.json'),
      JSON.stringify({ unknownOption: true }),
    );

    const unknown = await runCli([], { cwd: directory });
    assert.equal(unknown.code, 2);
    assert.match(unknown.stderr, /unknown configuration option "unknownOption"/);

    await writeFile(
      path.join(directory, 'guchho.test.config.json'),
      '{ invalid',
    );

    const malformed = await runCli([], { cwd: directory });
    assert.equal(malformed.code, 2);
    assert.match(malformed.stderr, /Failed to parse configuration file/);

    const missing = await runCli(['--config=missing.config.json'], {
      cwd: directory,
    });
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /Configuration file not found/);
  });
});
