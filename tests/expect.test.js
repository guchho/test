import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AssertionError, expect } from '@guchho/test';

function captureError(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }

  return undefined;
}

function expectFailure(fn, pattern) {
  const error = captureError(fn);
  assert.ok(error, 'expected the assertion to fail');
  assert.equal(error.name, 'AssertionError');
  if (pattern !== undefined) {
    assert.match(error.message, pattern);
  }
  return error;
}

async function expectAsyncFailure(fn, pattern) {
  let error;

  try {
    await fn();
  } catch (caught) {
    error = caught;
  }

  assert.ok(error, 'expected the async assertion to fail');
  assert.equal(error.name, 'AssertionError');
  if (pattern !== undefined) {
    assert.match(error.message, pattern);
  }
}

test('toBe uses Object.is semantics', () => {
  expect(1).toBe(1);
  expect(NaN).toBe(NaN);
  expect(0).not.toBe(-0);

  const error = expectFailure(
    () => expect(1).toBe(2),
    /expect\(received\)\.toBe\(expected\)/,
  );
  assert.match(error.message, /Expected: 2/);
  assert.match(error.message, /Received: 1/);
  expectFailure(() => expect(1).not.toBe(1), /not\.toBe/);
});

test('toEqual and toStrictEqual handle deep structures', () => {
  expect({ a: 1, nested: { list: [1, 2] } }).toEqual({
    a: 1,
    nested: { list: [1, 2] },
  });
  expect({ a: 1 }).toEqual({ a: 1, b: undefined });
  expect([1, , 3]).toEqual([1, undefined, 3]);

  class First {}
  class Second {}

  expect(new First()).toEqual(new Second());
  expectFailure(() => expect(new First()).toStrictEqual(new Second()));
  expectFailure(() => expect({ a: 1 }).toStrictEqual({ a: 1, b: undefined }));
  expectFailure(() => expect([1, , 3]).toStrictEqual([1, undefined, 3]));
  expectFailure(
    () => expect({ a: 1, b: 2 }).toEqual({ a: 1, b: 3 }),
    /Difference \(- expected, \+ received\)/,
  );
});

test('deep equality supports cycles, maps, sets, and built-in types', () => {
  const left = { value: 1 };
  left.self = left;
  const right = { value: 1 };
  right.self = right;
  expect(left).toEqual(right);

  const different = { value: 2 };
  different.self = different;
  expectFailure(() => expect(left).toEqual(different));

  expect(
    new Map([
      ['a', { id: 1 }],
      ['b', 2],
    ]),
  ).toEqual(
    new Map([
      ['b', 2],
      ['a', { id: 1 }],
    ]),
  );
  expect(new Set([{ id: 1 }, 2])).toEqual(new Set([2, { id: 1 }]));
  expectFailure(() => expect(new Set([1, 2])).toEqual(new Set([1, 3])));

  expect(new Date(1234)).toEqual(new Date(1234));
  expectFailure(() => expect(new Date(1)).toEqual(new Date(2)));
  expect(/abc/gi).toEqual(/abc/gi);
  expectFailure(() => expect(/abc/g).toEqual(/abc/i));
  expect(new Uint8Array([1, 2])).toEqual(new Uint8Array([1, 2]));
  expectFailure(() =>
    expect(new Uint8Array([1, 2])).toEqual(new Uint16Array([1, 2])),
  );
  expect(new Uint8Array([1, 2]).buffer).toEqual(new Uint8Array([1, 2]).buffer);
  expect(new Error('same')).toEqual(new Error('same'));
  expectFailure(() => expect(new Error('one')).toEqual(new Error('two')));
});

test('truthiness and nullish matchers work in both directions', () => {
  expect('value').toBeTruthy();
  expect(0).toBeFalsy();
  expect(null).toBeNull();
  expect(undefined).toBeUndefined();
  expect(0).toBeDefined();

  expectFailure(() => expect(0).toBeTruthy(), /toBeTruthy/);
  expectFailure(() => expect(1).toBeFalsy(), /toBeFalsy/);
  expectFailure(() => expect(undefined).toBeNull(), /toBeNull/);
  expectFailure(() => expect(null).toBeUndefined(), /toBeUndefined/);
  expectFailure(() => expect(undefined).toBeDefined(), /toBeDefined/);
  expect(1).not.toBeNull();
});

test('toBeInstanceOf checks constructors', () => {
  expect(new TypeError('bad')).toBeInstanceOf(TypeError);
  expect(new Error('bad')).not.toBeInstanceOf(TypeError);
  expectFailure(() => expect({}).toBeInstanceOf(Error), /toBeInstanceOf/);
  assert.throws(() => expect({}).toBeInstanceOf('Error'), TypeError);
});

test('toContain supports strings and iterables', () => {
  expect('hello world').toContain('world');
  expect([1, 2, 3]).toContain(2);
  expect([{ id: 1 }]).toContain({ id: 1 });
  expect(new Set([1, 2])).toContain(2);
  expect([1, 2]).not.toContain(3);

  expectFailure(() => expect('hello').toContain('missing'), /toContain/);
  expectFailure(() => expect([1, 2]).toContain(3), /toContain/);
  assert.throws(() => expect('abc').toContain(1), TypeError);
  assert.throws(() => expect(5).toContain(1), TypeError);
});

test('toMatch supports strings and regular expressions', () => {
  expect('hello world').toMatch('world');
  expect('hello world').toMatch(/^hello/);
  expect('hello').not.toMatch(/bye/);

  const pattern = /hello/g;
  pattern.lastIndex = 3;
  expect('hello').toMatch(pattern);
  assert.equal(pattern.lastIndex, 3);

  expectFailure(() => expect('hello').toMatch('bye'), /toMatch/);
  assert.throws(() => expect(5).toMatch('5'), TypeError);
  assert.throws(() => expect('hello').toMatch(5), TypeError);
});

test('toHaveLength supports collections and typed arrays', () => {
  expect('hello').toHaveLength(5);
  expect([1, 2]).toHaveLength(2);
  expect(new Map([['a', 1]])).toHaveLength(1);
  expect(new Set([1, 2])).toHaveLength(2);
  expect(new Uint8Array([1, 2, 3])).toHaveLength(3);
  expect('hello').not.toHaveLength(4);

  expectFailure(() => expect('hello').toHaveLength(4), /toHaveLength/);
  assert.throws(() => expect('hello').toHaveLength(-1), TypeError);
  assert.throws(() => expect(5).toHaveLength(1), TypeError);
});

test('toThrow and toThrowError match thrown values', () => {
  expect(() => {
    throw new Error('boom');
  }).toThrow();
  expect(() => {
    throw new Error('boom');
  }).toThrow('boom');
  expect(() => {
    throw new Error('boom');
  }).toThrow(/bo+m/);
  expect(() => {
    throw new Error('boom');
  }).toThrow(Error);
  expect(() => {
    throw new TypeError('bad type');
  }).toThrow(TypeError);
  expect(() => {
    throw new Error('boom');
  }).toThrow(new Error('boom'));
  expect(() => {}).not.toThrow();
  expect(() => {
    throw new Error('boom');
  }).toThrowError('boom');

  expectFailure(() => expect(() => {}).toThrow(), /function did not throw/);
  expectFailure(
    () =>
      expect(() => {
        throw new Error('boom');
      }).toThrow('missing'),
    /Received thrown value/,
  );
  expectFailure(
    () =>
      expect(() => {
        throw new Error('boom');
      }).not.toThrow(),
    /not\.toThrow/,
  );
  assert.throws(() => expect(5).toThrow(), TypeError);
  assert.throws(() => expect(async () => {}).toThrow(), /returned a promise/);
});

test('numeric comparison matchers work', () => {
  expect(5).toBeGreaterThan(4);
  expect(4).toBeLessThan(5);
  expect(5).toBeGreaterThanOrEqual(5);
  expect(5).toBeLessThanOrEqual(5);
  expect(5).not.toBeGreaterThan(5);

  expectFailure(() => expect(3).toBeGreaterThan(4), />/);
  expectFailure(() => expect(5).toBeLessThan(4), /</);
  expectFailure(() => expect(4).toBeGreaterThanOrEqual(5), />=/);
  expectFailure(() => expect(6).toBeLessThanOrEqual(5), /<=/);
  assert.throws(() => expect('5').toBeGreaterThan(4), TypeError);
  assert.throws(() => expect(5).toBeGreaterThan('4'), TypeError);
});

test('resolves and rejects matchers handle promises', async () => {
  await expect(Promise.resolve(1)).resolves.toBe(1);
  await expect(Promise.resolve({ id: 1 })).resolves.toEqual({ id: 1 });
  await expect(Promise.resolve(1)).resolves.not.toBe(2);
  await expect(Promise.reject(new Error('bad'))).rejects.toThrow('bad');
  await expect(Promise.reject(new Error('bad'))).rejects.toThrowError(/bad/);
  await expect(Promise.reject(new Error('bad'))).rejects.toBeInstanceOf(Error);
  await expect(Promise.reject('reason')).rejects.toBe('reason');
  await expect(Promise.reject(new Error('bad'))).rejects.not.toThrow(
    'different',
  );

  await expectAsyncFailure(
    () => expect(Promise.resolve(1)).rejects.toBe(1),
    /Expected promise to reject/,
  );
  await expectAsyncFailure(
    () => expect(Promise.reject(new Error('bad'))).resolves.toBe(1),
    /Expected promise to resolve/,
  );
  await expectAsyncFailure(
    () => expect(Promise.resolve(2)).resolves.toBe(1),
    /expect\(received\)\.resolves\.toBe/,
  );
  await expectAsyncFailure(
    () => expect(1).resolves.toBe(1),
    /must be a promise/,
  );
});

test('custom matchers extend expect', async () => {
  expect.extend({
    toBeWithinRange(actual, minimum, maximum) {
      const pass =
        typeof actual === 'number' && actual >= minimum && actual <= maximum;

      return {
        pass,
        message: () =>
          `expected ${this.utils.printReceived(actual)} ${this.isNot ? 'not ' : ''}to be within ${minimum}..${maximum}`,
      };
    },
  });

  expect(5).toBeWithinRange(1, 10);
  expect(12).not.toBeWithinRange(1, 10);
  await expect(Promise.resolve(5)).resolves.toBeWithinRange(1, 10);

  expectFailure(() => expect(12).toBeWithinRange(1, 10), /within 1\.\.10/);
  assert.throws(
    () => expect.extend({ not: () => ({ pass: true }) }),
    TypeError,
  );
  assert.throws(() => expect.extend({ broken: 5 }), TypeError);
});

test('custom equality tests participate in toEqual', () => {
  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }

  const removePoint = expect.addEqualityTest((actual, expected, equals) => {
    if (actual instanceof Point && expected instanceof Point) {
      return equals(actual.x, expected.x) && equals(actual.y, expected.y);
    }

    return undefined;
  });

  try {
    expect(new Point(1, 2)).toEqual(new Point(1, 2));
    expectFailure(() => expect(new Point(1, 2)).toEqual(new Point(1, 3)));
  } finally {
    removePoint();
  }

  const remove = expect.addEqualityTest((actual, expected) => {
    if (
      actual !== null &&
      expected !== null &&
      typeof actual === 'object' &&
      typeof expected === 'object' &&
      'id' in actual &&
      'id' in expected
    ) {
      return actual.id === expected.id;
    }

    return undefined;
  });

  try {
    expect({ id: 1, name: 'left' }).toEqual({ id: 1, name: 'right' });
    expectFailure(() => expect({ id: 1 }).toEqual({ id: 2 }));
    expect({ id: 1 }).not.toEqual({ id: 2 });
  } finally {
    remove();
  }

  expectFailure(() =>
    expect({ id: 1, name: 'left' }).toEqual({ id: 1, name: 'right' }),
  );
});

test('assertion failures are AssertionError instances with context', () => {
  const error = expectFailure(() => expect(1).toBe(2));
  assert.ok(error instanceof AssertionError);
  assert.match(error.message, /Expected: 2/);
  assert.match(error.message, /Received: 1/);

  const diffError = expectFailure(() =>
    expect({ value: 'actual' }).toEqual({ value: 'expected' }),
  );
  assert.match(diffError.message, /- .*expected/);
  assert.match(diffError.message, /\+ .*actual/);
});

test('expect.poll retries until the assertion passes', async () => {
  let attempts = 0;

  await expect
    .poll(
      () => {
        attempts += 1;
        return attempts < 3 ? 'pending' : 'ready';
      },
      { timeout: 500, interval: 5 },
    )
    .toBe('ready');

  assert.equal(attempts, 3);
});

test('expect.poll supports async callbacks and negation', async () => {
  let attempts = 0;

  await expect
    .poll(
      async () => {
        attempts += 1;
        return attempts < 2 ? 'pending' : 'done';
      },
      { timeout: 500, interval: 5 },
    )
    .not.toBe('pending');

  assert.equal(attempts, 2);
});

test('expect.poll fails after the timeout', async () => {
  await assert.rejects(
    () =>
      expect.poll(() => 'pending', { timeout: 20, interval: 5 }).toBe('ready'),
    AssertionError,
  );
});

test('expect.poll validates its callback and options', () => {
  assert.throws(() => expect.poll(null), TypeError);
  assert.throws(() => expect.poll(() => true, { timeout: 0 }), TypeError);
  assert.throws(() => expect.poll(() => true, { interval: -1 }), TypeError);
});
