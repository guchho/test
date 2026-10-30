import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AssertionError,
  defineConfig,
  describe,
  expect,
  it,
  only,
  skip,
  suite,
  test as guchhoTest,
  todo,
  version,
} from '@guchho/test';
import {
  defaultConfig,
  defaultExclude,
  defaultInclude,
  defaultTimeout,
} from '@guchho/test/config';

const packageJson = JSON.parse(
  await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
);

test('version matches package metadata', () => {
  assert.equal(version, packageJson.version);
});

test('package exposes the expected entry points', () => {
  assert.equal(typeof defineConfig, 'function');
  assert.equal(packageJson.name, '@guchho/test');
  assert.equal(packageJson.type, 'module');
  assert.ok(packageJson.exports['.']);
  assert.ok(packageJson.exports['./config']);
});

test('package exposes the test registration API', () => {
  for (const api of [describe, it, guchhoTest, suite, only, skip, todo]) {
    assert.equal(typeof api, 'function');
  }

  assert.equal(guchhoTest, it);
  assert.equal(suite, describe);
  assert.equal(typeof expect, 'function');
  assert.equal(typeof expect.extend, 'function');
  assert.equal(typeof expect.addEqualityTest, 'function');
  assert.equal(typeof AssertionError, 'function');
});

test('defineConfig returns the provided config unchanged', () => {
  const config = { timeout: 1000, include: ['src/**/*.test.ts'] };
  assert.equal(defineConfig(config), config);
});

test('defaults cover supported extensions', () => {
  assert.equal(defaultTimeout, 5000);
  assert.deepEqual([...defaultInclude], [
    '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  ]);
  assert.ok(defaultExclude.includes('**/node_modules/**'));
});

test('default config is frozen and consistent', () => {
  assert.ok(Object.isFrozen(defaultConfig));
  assert.equal(defaultConfig.timeout, defaultTimeout);
  assert.deepEqual(defaultConfig.include, [...defaultInclude]);
  assert.deepEqual(defaultConfig.exclude, [...defaultExclude]);
  assert.deepEqual(defaultConfig.reporters, ['default']);
  assert.equal(defaultConfig.coverage.enabled, false);
});
