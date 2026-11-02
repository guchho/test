import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { mock } from '../dist/mock/mock.js';

const realSetTimeout = globalThis.setTimeout;
const realDateNow = Date.now;

afterEach(() => {
  mock.useRealTimers();
});

test('advances timeout callbacks in due order', () => {
  const calls = [];

  mock.useFakeTimers();
  assert.equal(mock.isFakeTimers(), true);

  setTimeout(() => calls.push('second'), 20);
  setTimeout(() => calls.push('first'), 10);

  mock.advanceTimersByTime(10);
  assert.deepEqual(calls, ['first']);
  assert.equal(mock.getTimerCount(), 1);

  mock.advanceTimersByTime(9);
  assert.deepEqual(calls, ['first']);

  mock.advanceTimersByTime(1);
  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(mock.getTimerCount(), 0);
});

test('runs intervals and clears timers by handle', () => {
  const calls = [];

  mock.useFakeTimers();
  const interval = setInterval(() => calls.push('tick'), 5);

  mock.advanceTimersByTime(12);
  assert.deepEqual(calls, ['tick', 'tick']);

  clearInterval(interval);
  mock.advanceTimersByTime(50);
  assert.deepEqual(calls, ['tick', 'tick']);

  const timeout = setTimeout(() => calls.push('never'), 10);
  clearTimeout(timeout);
  assert.equal(mock.getTimerCount(), 0);
});

test('runs all timers and only pending timers', () => {
  const calls = [];

  mock.useFakeTimers();
  setTimeout(() => {
    calls.push('outer');
    setTimeout(() => calls.push('inner'), 100);
  }, 10);

  mock.runOnlyPendingTimers();
  assert.deepEqual(calls, ['outer']);
  assert.equal(mock.getTimerCount(), 1);

  mock.runAllTimers();
  assert.deepEqual(calls, ['outer', 'inner']);
  assert.equal(mock.getTimerCount(), 0);
});

test('advanceTimersToNextTimer runs only the next timer', () => {
  const calls = [];

  mock.useFakeTimers();
  setTimeout(() => calls.push('late'), 30);
  setTimeout(() => calls.push('early'), 10);

  mock.advanceTimersToNextTimer();
  assert.deepEqual(calls, ['early']);
  assert.equal(mock.getTimerCount(), 1);
});

test('controls Date and restores real timers', () => {
  mock.useFakeTimers();
  mock.setSystemTime(new Date('2024-01-02T03:04:05.000Z'));

  assert.equal(Date.now(), Date.parse('2024-01-02T03:04:05.000Z'));
  assert.equal(new Date().toISOString(), '2024-01-02T03:04:05.000Z');
  assert.equal(typeof Date(), 'string');
  assert.match(Date(), /2024/);

  mock.advanceTimersByTime(1000);
  assert.equal(Date.now(), Date.parse('2024-01-02T03:04:05.000Z') + 1000);

  mock.useRealTimers();
  assert.equal(mock.isFakeTimers(), false);
  assert.equal(globalThis.setTimeout, realSetTimeout);
  assert.equal(Date.now, realDateNow);
  assert.throws(() => mock.advanceTimersByTime(1), /not installed/);
});

test('only replaces selected timers', () => {
  const realImmediate = globalThis.setImmediate;

  mock.useFakeTimers({ toFake: ['setTimeout', 'Date'] });

  assert.notEqual(globalThis.setTimeout, realSetTimeout);
  assert.equal(globalThis.setImmediate, realImmediate);
  assert.equal(typeof Date.now, 'function');

  mock.useRealTimers();
  assert.equal(globalThis.setTimeout, realSetTimeout);
  assert.equal(globalThis.setImmediate, realImmediate);
});
