import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';

import { expect } from '../dist/expect/expect.js';
import { AssertionError } from '../dist/expect/errors.js';
import { mock } from '../dist/mock/mock.js';

nodeTest('mock.fn tracks calls, results, instances, and order', () => {
  const calls = mock.fn((value) => value * 2);

  assert.equal(calls(2), 4);
  assert.equal(calls(3), 6);
  assert.deepEqual(calls.mock.calls, [[2], [3]]);
  assert.deepEqual(calls.mock.lastCall, [3]);
  assert.deepEqual(calls.mock.results, [
    { type: 'return', value: 4 },
    { type: 'return', value: 6 },
  ]);
  assert.equal(calls.mock.invocationCallOrder.length, 2);
  assert.ok(
    calls.mock.invocationCallOrder[0] < calls.mock.invocationCallOrder[1],
  );

  const Constructor = mock.fn(function () {});
  const instance = new Constructor('created');

  assert.deepEqual(Constructor.mock.calls, [['created']]);
  assert.equal(Constructor.mock.instances[0], instance);
});

nodeTest('mock.fn supports implementations and one-time values', async () => {
  const fn = mock.fn(() => 42);

  fn.mockReturnValue(100);
  assert.equal(fn(), 100);

  fn.mockReturnValueOnce(200);
  assert.equal(fn(), 200);
  assert.equal(fn(), 100);

  fn.mockImplementation((value) => value + 1);
  assert.equal(fn(4), 5);

  fn.mockImplementationOnce(() => 9);
  assert.equal(fn(), 9);
  assert.equal(fn(4), 5);

  const asyncFn = mock.fn();
  asyncFn.mockResolvedValue({ success: true });
  assert.deepEqual(await asyncFn(), { success: true });

  asyncFn.mockResolvedValueOnce({ success: false });
  assert.deepEqual(await asyncFn(), { success: false });
  assert.deepEqual(await asyncFn(), { success: true });

  asyncFn.mockRejectedValue(new Error('failed'));
  await assert.rejects(asyncFn, /failed/);

  asyncFn.mockRejectedValueOnce('once');
  await assert.rejects(asyncFn, (error) => error === 'once');
  await assert.rejects(asyncFn, /failed/);

  const throwing = mock.fn(() => {
    throw new Error('thrown');
  });

  assert.throws(throwing, /thrown/);
  assert.equal(throwing.mock.results[0].type, 'throw');
  assert.match(throwing.mock.results[0].value.message, /thrown/);
});

nodeTest('mock clear and reset preserve documented behavior', () => {
  const fn = mock.fn(() => 'initial');

  fn();
  fn.mockReturnValue('changed');
  fn();

  fn.mockClear();
  assert.deepEqual(fn.mock.calls, []);
  assert.equal(fn(), 'changed');

  fn.mockReturnValueOnce('once');
  fn.mockReset();
  assert.equal(fn(), 'initial');
  assert.equal(fn(), 'initial');
});

nodeTest('global mock helpers clear, reset, and restore mocks', () => {
  const first = mock.fn(() => 1);
  const second = mock.fn(() => 2);

  first();
  second();
  mock.clearAll();
  assert.deepEqual(first.mock.calls, []);
  assert.deepEqual(second.mock.calls, []);

  first.mockReturnValue(10);
  second.mockReturnValue(20);
  mock.resetAll();
  assert.equal(first(), 1);
  assert.equal(second(), 2);

  const target = { value: () => 'original' };
  const spy = mock.spyOn(target, 'value');
  spy.mockReturnValue('spied');
  assert.equal(target.value(), 'spied');

  mock.restoreAll();
  assert.equal(target.value(), 'original');
  assert.equal(Object.hasOwn(target, 'value'), true);
});

nodeTest('mock.spyOn wraps methods and restores descriptors', () => {
  const target = {
    value: 1,
    increment(amount) {
      return this.value + amount;
    },
  };

  const spy = mock.spyOn(target, 'increment');

  assert.equal(target.increment(2), 3);
  assert.deepEqual(spy.mock.calls, [[2]]);

  spy.mockReturnValue(99);
  assert.equal(target.increment(5), 99);

  spy.mockReset();
  assert.equal(target.increment(1), 2);

  spy.mockRestore();
  assert.equal(target.increment(1), 2);
});

nodeTest('mock.spyOn supports inherited methods', () => {
  const prototype = {
    greet(name) {
      return `hello ${name}`;
    },
  };
  const target = Object.create(prototype);

  assert.equal(Object.hasOwn(target, 'greet'), false);

  const spy = mock.spyOn(target, 'greet');
  assert.equal(Object.hasOwn(target, 'greet'), true);
  assert.equal(target.greet('world'), 'hello world');

  spy.mockRestore();
  assert.equal(Object.hasOwn(target, 'greet'), false);
  assert.equal(target.greet('again'), 'hello again');
});

nodeTest('mock.spyOn rejects unsupported properties', () => {
  assert.throws(() => mock.spyOn({}, 'missing'), /does not exist/);

  assert.throws(
    () =>
      mock.spyOn(
        Object.defineProperty({}, 'fixed', {
          value: () => {},
          configurable: false,
        }),
        'fixed',
      ),
    /not configurable/,
  );

  assert.throws(
    () =>
      mock.spyOn(
        Object.defineProperty({}, 'accessor', {
          get: () => () => {},
          configurable: true,
        }),
        'accessor',
      ),
    /only configurable function properties/,
  );

  assert.throws(
    () => mock.spyOn({ value: 1 }, 'value'),
    /only configurable function properties/,
  );
});

nodeTest('mock matchers assert calls and arguments', () => {
  const fn = mock.fn();

  expect(fn).not.toHaveBeenCalled();
  fn('hello', { id: 1 });

  expect(fn).toHaveBeenCalled();
  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith('hello', { id: 1 });
  expect(fn).not.toHaveBeenCalledWith('other');

  fn('second');
  expect(fn).not.toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith('second');

  assert.throws(() => expect(fn).toHaveBeenCalledTimes(5), AssertionError);
  assert.throws(
    () => expect(fn).toHaveBeenCalledWith('missing'),
    AssertionError,
  );
  assert.throws(() => expect(() => {}).toHaveBeenCalled(), TypeError);
});
