import assert from 'node:assert/strict';
import { test } from 'node:test';

import { installEnvironment } from '../dist/environment/index.js';

async function packageAvailable(name) {
  try {
    await import(name);
    return true;
  } catch {
    return false;
  }
}

test('the node environment is a no-op', async () => {
  const globalKeys = new Set(Object.keys(globalThis));
  const installed = await installEnvironment('node');

  assert.equal(installed.name, 'node');
  assert.deepEqual(new Set(Object.keys(globalThis)), globalKeys);

  installed.teardown();
  assert.deepEqual(new Set(Object.keys(globalThis)), globalKeys);
});

for (const name of ['jsdom', 'happy-dom']) {
  test(`reports a missing ${name} package`, async (t) => {
    if (await packageAvailable(name)) {
      t.skip(`${name} is installed`);
      return;
    }

    await assert.rejects(
      installEnvironment(name),
      new RegExp(`The "${name}" test environment is not available`),
    );
    await assert.rejects(
      installEnvironment(name),
      new RegExp(`npm install --save-dev ${name}`),
    );
  });
}

test('validates environment names', async () => {
  await assert.rejects(
    installEnvironment('browser'),
    /Unknown test environment "browser"/,
  );
});
