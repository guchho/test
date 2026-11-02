import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  getRootSuite,
  it,
  only,
  resetRegistry,
  skip,
  todo,
  test as guchhoTest,
} from '../dist/runner/registry.js';
import { runSuite } from '../dist/runner/executor.js';

async function run(register, options) {
  resetRegistry();
  register();
  return runSuite(getRootSuite(), options);
}

nodeTest('collects nested suites in registration order', async () => {
  const order = [];
  const result = await run(() => {
    describe('outer', () => {
      guchhoTest('first', () => {
        order.push('first');
      });

      describe('inner', () => {
        it('second', () => {
          order.push('second');
        });
      });

      it('third', () => {
        order.push('third');
      });
    });
  });

  assert.deepEqual(order, ['first', 'second', 'third']);
  assert.equal(result.summary.passed, 3);
  assert.deepEqual(
    result.results.map((entry) => entry.fullName),
    ['outer > first', 'outer > inner > second', 'outer > third'],
  );
});

nodeTest('runs async tests and isolates failures', async () => {
  const order = [];
  const result = await run(() => {
    it('async pass', async () => {
      await Promise.resolve();
      order.push('pass');
    });

    it('fails', () => {
      throw new Error('boom');
    });

    it('after failure', () => {
      order.push('after');
    });
  });

  assert.deepEqual(order, ['pass', 'after']);
  assert.deepEqual(
    result.results.map((entry) => entry.status),
    ['passed', 'failed', 'passed'],
  );
  assert.match(result.results[1].error.message, /boom/);
  assert.equal(result.success, false);
});

nodeTest('supports thenables and non-Error rejections', async () => {
  const result = await run(() => {
    it('thenable', () => ({
      then(resolve) {
        resolve();
      },
    }));

    it('throws a string', () => {
      throw 'string failure';
    });
  });

  assert.equal(result.summary.passed, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.results[1].error, 'string failure');
});

nodeTest('enforces per-test timeouts', async () => {
  const result = await run(() => {
    it('slow test', async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }, 5);
  });

  assert.equal(result.summary.failed, 1);
  assert.match(result.results[0].error.message, /timed out after 5ms/);
});

nodeTest('applies skip, only, and todo modifiers', async () => {
  const result = await run(() => {
    it('normal', () => {
      throw new Error('must not run');
    });

    only('focused', () => {});
    skip('skipped', () => {
      throw new Error('must not run');
    });
    todo('pending');

    describe.only('focused suite', () => {
      it('focused child', () => {});
    });

    describe.skip('skipped suite', () => {
      it('skipped child', () => {
        throw new Error('must not run');
      });
    });
  });

  assert.deepEqual(
    result.results.map((entry) => [entry.fullName, entry.status]),
    [
      ['normal', 'skipped'],
      ['focused', 'passed'],
      ['skipped', 'skipped'],
      ['pending', 'todo'],
      ['focused suite > focused child', 'passed'],
      ['skipped suite > skipped child', 'skipped'],
    ],
  );
  assert.equal(result.summary.passed, 2);
});

nodeTest('filters tests by full name', async () => {
  const result = await run(
    () => {
      describe('group', () => {
        it('alpha test', () => {});
        it('beta test', () => {});
      });
    },
    { filter: 'beta' },
  );

  assert.equal(result.summary.total, 1);
  assert.equal(result.results[0].fullName, 'group > beta test');
});

nodeTest('validates test registration input', () => {
  resetRegistry();

  assert.throws(() => it('', () => {}), TypeError);
  assert.throws(() => it('missing callback'), TypeError);
  assert.throws(() => only('missing focused callback'), TypeError);
  assert.throws(() => it('invalid timeout', () => {}, 0), TypeError);
  assert.throws(() => it('invalid callback', 'nope'), TypeError);
  assert.throws(() => describe('', () => {}), TypeError);
});

nodeTest('runs nested lifecycle hooks in deterministic order', async () => {
  const order = [];
  const result = await run(() => {
    describe('outer', () => {
      beforeAll(() => order.push('outer beforeAll'));
      beforeEach(() => order.push('outer beforeEach'));
      afterEach(() => order.push('outer afterEach'));
      afterAll(() => order.push('outer afterAll'));

      it('first', () => order.push('first'));

      describe('inner', () => {
        beforeAll(() => order.push('inner beforeAll'));
        beforeEach(() => order.push('inner beforeEach'));
        afterEach(() => order.push('inner afterEach'));
        afterAll(() => order.push('inner afterAll'));

        it('second', () => order.push('second'));
      });

      it('third', () => order.push('third'));
    });
  });

  assert.deepEqual(order, [
    'outer beforeAll',
    'outer beforeEach',
    'first',
    'outer afterEach',
    'inner beforeAll',
    'outer beforeEach',
    'inner beforeEach',
    'second',
    'inner afterEach',
    'outer afterEach',
    'inner afterAll',
    'outer beforeEach',
    'third',
    'outer afterEach',
    'outer afterAll',
  ]);
  assert.equal(result.summary.passed, 3);
  assert.deepEqual(result.errors, []);
});

nodeTest('supports async hooks and cleans up after failures', async () => {
  const order = [];
  const result = await run(() => {
    beforeAll(async () => {
      await Promise.resolve();
      order.push('beforeAll');
    });

    beforeEach(() => order.push('beforeEach'));
    afterEach(async () => {
      await Promise.resolve();
      order.push('afterEach');
    });
    afterAll(() => order.push('afterAll'));

    it('fails', () => {
      order.push('test');
      throw new Error('boom');
    });
  });

  assert.deepEqual(order, [
    'beforeAll',
    'beforeEach',
    'test',
    'afterEach',
    'afterAll',
  ]);
  assert.equal(result.summary.failed, 1);
  assert.deepEqual(result.errors, []);
});

nodeTest('records beforeAll failures and skips the suite', async () => {
  const order = [];
  const result = await run(() => {
    describe('broken', () => {
      beforeAll(() => {
        throw new Error('setup failed');
      });
      afterAll(() => order.push('cleanup'));

      it('child', () => order.push('child'));

      describe('nested', () => {
        it('grandchild', () => order.push('grandchild'));
      });
    });
  });

  assert.deepEqual(order, ['cleanup']);
  assert.deepEqual(
    result.results.map((entry) => [entry.fullName, entry.status]),
    [
      ['broken > child', 'skipped'],
      ['broken > nested > grandchild', 'skipped'],
    ],
  );
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].type, 'beforeAll');
  assert.equal(result.errors[0].suite, 'broken');
  assert.match(result.errors[0].error.message, /setup failed/);
  assert.equal(result.success, false);
});

nodeTest(
  'fails a test when beforeEach fails but still runs afterEach',
  async () => {
    const order = [];
    const result = await run(() => {
      beforeEach(() => {
        throw new Error('beforeEach failed');
      });
      afterEach(() => order.push('afterEach'));

      it('skipped by hook failure', () => order.push('test'));
    });

    assert.deepEqual(order, ['afterEach']);
    assert.equal(result.results[0].status, 'failed');
    assert.match(result.results[0].error.message, /beforeEach failed/);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].type, 'beforeEach');
    assert.equal(result.success, false);
  },
);

nodeTest('does not run hooks for filtered or skipped suites', async () => {
  const order = [];
  const result = await run(
    () => {
      describe('selected', () => {
        beforeAll(() => order.push('selected beforeAll'));
        it('keep', () => order.push('keep'));
      });

      describe.skip('skipped', () => {
        beforeAll(() => order.push('skipped beforeAll'));
        it('skip me', () => order.push('skip me'));
      });

      describe('filtered', () => {
        beforeAll(() => order.push('filtered beforeAll'));
        it('drop', () => order.push('drop'));
      });
    },
    { filter: 'keep' },
  );

  assert.deepEqual(order, ['selected beforeAll', 'keep']);
  assert.equal(result.summary.total, 1);
  assert.deepEqual(result.errors, []);
});

nodeTest('validates hook registration input', () => {
  resetRegistry();

  assert.throws(() => beforeAll('nope'), TypeError);
  assert.throws(() => afterAll(undefined), TypeError);
  assert.throws(() => beforeEach(null), TypeError);
  assert.throws(() => afterEach(42), TypeError);
});

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

nodeTest(
  'runs it.concurrent tests in parallel in registration order',
  async () => {
    let active = 0;
    let maxActive = 0;

    const result = await run(() => {
      it.concurrent('first', async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(20);
        active -= 1;
      });

      it.concurrent('second', async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(20);
        active -= 1;
      });
    });

    assert.equal(maxActive, 2);
    assert.deepEqual(
      result.results.map((entry) => entry.fullName),
      ['first', 'second'],
    );
    assert.equal(result.summary.passed, 2);
  },
);

nodeTest('describe.concurrent runs nested tests concurrently', async () => {
  let active = 0;
  let maxActive = 0;
  let beforeAllCount = 0;
  let afterAllCount = 0;
  let beforeEachCount = 0;

  const track = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await delay(20);
    active -= 1;
  };

  const result = await run(() => {
    describe.concurrent('parallel', () => {
      beforeAll(() => {
        beforeAllCount += 1;
      });
      beforeEach(() => {
        beforeEachCount += 1;
      });
      afterAll(() => {
        afterAllCount += 1;
      });

      it('first', track);

      describe('nested', () => {
        it('second', track);
        it('third', track);
      });
    });
  });

  assert.equal(maxActive, 3);
  assert.equal(beforeAllCount, 1);
  assert.equal(afterAllCount, 1);
  assert.equal(beforeEachCount, 3);
  assert.equal(result.summary.passed, 3);
});

nodeTest(
  'runs concurrent tests as a batch before later sequential tests',
  async () => {
    const order = [];

    const result = await run(() => {
      it.concurrent('first', async () => {
        order.push('first start');
        await delay(20);
        order.push('first end');
      });

      it.concurrent('second', async () => {
        order.push('second start');
        await delay(20);
        order.push('second end');
      });

      it('after', () => {
        order.push('after');
      });
    });

    assert.deepEqual(order.slice(0, 2), ['first start', 'second start']);
    assert.equal(order[order.length - 1], 'after');
    assert.equal(result.summary.passed, 3);
  },
);

nodeTest('supports it.runIf and it.skipIf', async () => {
  const order = [];
  const result = await run(() => {
    it.runIf(true)('runs when true', () => order.push('run true'));
    it.runIf(false)('skips when false', () => order.push('run false'));
    it.skipIf(true)('skips when true', () => order.push('skip true'));
    it.skipIf(false)('runs when false', () => order.push('skip false'));
  });

  assert.deepEqual(order, ['run true', 'skip false']);
  assert.deepEqual(
    result.results.map((entry) => [entry.fullName, entry.status]),
    [
      ['runs when true', 'passed'],
      ['skips when false', 'skipped'],
      ['skips when true', 'skipped'],
      ['runs when false', 'passed'],
    ],
  );
});

nodeTest('supports conditional table tests', async () => {
  const order = [];
  const result = await run(() => {
    it.runIf(true).each([[1], [2]])('runs %d', (value) => order.push(value));

    it.skipIf(true).each([[3], [4]])('skips %d', (value) => order.push(value));
  });

  assert.deepEqual(order, [1, 2]);
  assert.equal(result.summary.passed, 2);
  assert.equal(result.summary.skipped, 2);
});

nodeTest('validates conditional modifier input', () => {
  resetRegistry();

  assert.throws(() => it.runIf('yes'), TypeError);
  assert.throws(() => it.skipIf(1), TypeError);
});

nodeTest('retries failing tests using the retry option', async () => {
  let attempts = 0;
  const result = await run(() => {
    it(
      'eventually passes',
      () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error(`attempt ${attempts}`);
        }
      },
      { retry: 2 },
    );
  });

  assert.equal(attempts, 3);
  assert.equal(result.summary.passed, 1);
  assert.equal(result.summary.failed, 0);
});

nodeTest('reports the final failure after retries are exhausted', async () => {
  let attempts = 0;
  const result = await run(() => {
    it(
      'never passes',
      () => {
        attempts += 1;
        throw new Error(`failure ${attempts}`);
      },
      { retry: 1 },
    );
  });

  assert.equal(attempts, 2);
  assert.equal(result.summary.failed, 1);
  assert.match(result.results[0].error.message, /failure 2/);
});

nodeTest('supports it.retry in curried and direct forms', async () => {
  let curriedAttempts = 0;
  let directAttempts = 0;

  const result = await run(() => {
    it.retry(1)('curried', () => {
      curriedAttempts += 1;
      if (curriedAttempts < 2) {
        throw new Error('retry');
      }
    });

    it.retry(
      'direct',
      () => {
        directAttempts += 1;
        if (directAttempts < 2) {
          throw new Error('retry');
        }
      },
      1,
    );
  });

  assert.equal(curriedAttempts, 2);
  assert.equal(directAttempts, 2);
  assert.equal(result.summary.passed, 2);
});

nodeTest('retries the test cycle including lifecycle hooks', async () => {
  let attempts = 0;
  let beforeEachCount = 0;
  let afterEachCount = 0;

  const result = await run(() => {
    beforeEach(() => {
      beforeEachCount += 1;
    });
    afterEach(() => {
      afterEachCount += 1;
    });

    it(
      'retries hooks',
      () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error('retry');
        }
      },
      { retry: 1 },
    );
  });

  assert.equal(attempts, 2);
  assert.equal(beforeEachCount, 2);
  assert.equal(afterEachCount, 2);
  assert.equal(result.summary.passed, 1);
});

nodeTest('validates retry counts', () => {
  resetRegistry();

  assert.throws(() => it('negative', () => {}, { retry: -1 }), TypeError);
  assert.throws(() => it('fractional', () => {}, { retry: 1.5 }), TypeError);
  assert.throws(() => it.retry(-1), TypeError);
});

nodeTest('soft assertions record failures and continue the test', async () => {
  const { expect } = await import('@guchho/test');
  const order = [];

  const result = await run(() => {
    it('soft failures', () => {
      expect.soft(1).toBe(2);
      order.push('continued');
      expect.soft('left').toBe('right');
    });
  });

  assert.deepEqual(order, ['continued']);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.results[0].error.name, 'SoftAssertionError');
  assert.match(result.results[0].error.message, /Expected: 2/);
  assert.match(result.results[0].error.message, /Expected: 'right'/);
});

nodeTest('soft assertions pass when every assertion passes', async () => {
  const { expect } = await import('@guchho/test');

  const result = await run(() => {
    it('soft pass', () => {
      expect.soft(2 + 2).toBe(4);
      expect.soft({ id: 1 }).toEqual({ id: 1 });
    });
  });

  assert.equal(result.summary.passed, 1);
  assert.equal(result.results[0].error, undefined);
});
