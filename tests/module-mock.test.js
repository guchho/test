import assert from 'node:assert/strict';
import { afterEach, test as nodeTest } from 'node:test';
import { fileURLToPath } from 'node:url';

import { mock } from '../dist/mock/mock.js';
import {
  resetModuleMocks,
  setCurrentTestFile,
} from '../dist/mock/module.js';

setCurrentTestFile(fileURLToPath(import.meta.url));

afterEach(() => {
  resetModuleMocks();
});

nodeTest('mock.module replaces named and default exports', async () => {
  mock.module('./fixtures/modules/api.fixture.js', () => ({
    getUser: () => ({ id: 99, name: 'Mock User' }),
    version: 'mocked',
    default: (name) => `mocked ${name}`,
  }));

  const api = await import('./fixtures/modules/api.fixture.js');

  assert.deepEqual(api.getUser(), { id: 99, name: 'Mock User' });
  assert.equal(api.version, 'mocked');
  assert.equal(api.default('world'), 'mocked world');
});

nodeTest('resetModuleMocks restores the original module', async () => {
  mock.module('./fixtures/modules/api.fixture.js', () => ({
    getUser: () => ({ id: 42 }),
    version: 'mocked',
  }));

  const mocked = await import('./fixtures/modules/api.fixture.js');
  assert.deepEqual(mocked.getUser(), { id: 42 });

  resetModuleMocks();

  const original = await import('./fixtures/modules/api.fixture.js');
  assert.deepEqual(original.getUser(), { id: 1, name: 'Original User' });
  assert.equal(original.version, 'original');
  assert.equal(original.default('world'), 'hello world');
});

nodeTest('a later mock.module call replaces an earlier registration', async () => {
  const target = './fixtures/modules/api.fixture.js';

  mock.module(target, () => ({ version: 'first', getUser: () => 1 }));
  const first = await import(target);
  assert.equal(first.version, 'first');

  mock.module(target, () => ({ version: 'second', getUser: () => 2 }));
  const second = await import(target);
  assert.equal(second.version, 'second');
  assert.equal(second.getUser(), 2);
});

nodeTest('mock.module validates supported scenarios', () => {
  assert.throws(
    () => mock.module('some-package', () => ({})),
    /only supports relative or absolute file paths/,
  );

  assert.throws(
    () => mock.module('./fixtures/modules/missing.fixture.js', () => ({})),
    /no file exists/,
  );

  assert.throws(
    () => mock.module('./fixtures/modules/api.fixture.js', null),
    /factory function/,
  );

  assert.throws(
    () => mock.module('./fixtures/modules/api.fixture.js', () => null),
    /must return an object/,
  );

  assert.throws(
    () =>
      mock.module('./fixtures/modules/api.fixture.js', () => ({
        'not-valid': 1,
      })),
    /not a valid JavaScript identifier/,
  );

  assert.throws(
    () =>
      mock.module('./fixtures/modules/api.fixture.js', () => ({
        class: 1,
      })),
    /not a valid JavaScript identifier/,
  );
});
