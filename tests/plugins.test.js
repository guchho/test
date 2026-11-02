import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

async function withTempDirectory(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), 'guchho-plugin-'));

  try {
    await writeFile(
      path.join(directory, 'package.json'),
      '{"type":"module"}\n',
    );
    await writeFile(
      path.join(directory, 'example.test.js'),
      `import { it } from ${JSON.stringify(distIndexUrl)};\n` +
        "it('runs', () => {});\n",
    );
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('loads plugins and runs custom reporters with options', async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(
      path.join(directory, 'guchho.test.config.js'),
      'export default {\n' +
        "  plugins: ['./plugin.js'],\n" +
        "  reporters: [['custom', { label: 'CUSTOM' }]],\n" +
        '};\n',
    );
    await writeFile(
      path.join(directory, 'plugin.js'),
      'export default {\n' +
        "  name: 'local-plugin',\n" +
        '  reporters: {\n' +
        '    custom(options, io) {\n' +
        '      return {\n' +
        '        onRunFinish(report) {\n' +
        "          io.stdout(options.label + ' ' + report.summary.passed + '/' + report.summary.total + String.fromCharCode(10));\n" +
        '        },\n' +
        '      };\n' +
        '    },\n' +
        '  },\n' +
        '};\n',
    );

    const result = await runCli([], { cwd: directory });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /CUSTOM 1\/1/);
  });
});

test('exports plugin authoring helpers', async () => {
  const module = await import(distIndexUrl);
  assert.equal(typeof module.definePlugin, 'function');
  assert.equal(typeof module.defineReporter, 'function');

  const plugin = module.definePlugin({
    name: 'inline',
    reporters: {
      noop: module.defineReporter(() => ({})),
    },
  });

  assert.equal(plugin.name, 'inline');
  assert.throws(() => module.definePlugin({ name: '' }), /non-empty name/);

  const source = await readFile(
    path.join(repoRoot, 'src', 'plugins', 'types.ts'),
    'utf8',
  );
  assert.match(source, /ReporterFactory/);
});
