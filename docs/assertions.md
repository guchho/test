---
title: Assertions
description: The expect API, value and async matchers, asymmetric matchers, and custom matchers.
---

# Assertions

Import `expect` from `@guchho/test`:

```js
import { expect } from '@guchho/test';
```

An assertion throws `AssertionError` when it fails. Failed assertions inside a
test mark that test as failed.

## Value matchers

| Matcher                          | Description                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `toBe(expected)`                 | Strict identity using `Object.is`. `NaN` matches `NaN`; `0` does not match `-0`.                  |
| `toEqual(expected)`              | Deep equality. Ignored keys whose value is `undefined` are treated as missing.                    |
| `toStrictEqual(expected)`        | Deep equality that also checks prototypes and `undefined` keys.                                   |
| `toBeTruthy()`                   | `Boolean(received)` is `true`.                                                                    |
| `toBeFalsy()`                    | `Boolean(received)` is `false`.                                                                   |
| `toBeNull()`                     | Received is `null`.                                                                               |
| `toBeUndefined()`                | Received is `undefined`.                                                                          |
| `toBeDefined()`                  | Received is not `undefined`.                                                                      |
| `toBeInstanceOf(Constructor)`    | `received instanceof Constructor`.                                                                |
| `toContain(item)`                | String substring or iterable element. Object elements use deep equality.                          |
| `toMatch(stringOrRegExp)`        | String `includes` or regular-expression test. Received must be a string.                          |
| `toHaveLength(length)`           | Length/size of strings, arrays, maps, sets, typed arrays, or length-like objects.                 |
| `toThrow(expected?)`             | Received function throws; optionally matches the thrown value.                                    |
| `toThrowError(expected?)`        | Alias of `toThrow`.                                                                               |
| `toBeGreaterThan(number)`        | `received > number`.                                                                              |
| `toBeLessThan(number)`           | `received < number`.                                                                              |
| `toBeGreaterThanOrEqual(number)` | `received >= number`.                                                                             |
| `toBeLessThanOrEqual(number)`    | `received <= number`.                                                                             |
| `toBeCloseTo(number, digits?)`   | Numeric closeness within `10^-digits / 2`. Default precision is `2`.                              |
| `toMatchObject(object)`          | Recursive subset match. Arrays must have the same length and match element by element.            |
| `toHaveProperty(path, value?)`   | Property path exists, and optionally deep-equals `value`. Paths support dot and bracket notation. |

Examples:

```js
expect(2 + 2).toBe(4);
expect({ id: 1 }).toEqual({ id: 1 });
expect({ id: 1 }).toStrictEqual({ id: 1 });
expect('hello').toContain('ell');
expect([1, 2, 3]).toContain(2);
expect('hello world').toMatch(/^hello/);
expect([1, 2]).toHaveLength(2);
expect(() => {
  throw new Error('boom');
}).toThrow('boom');
expect(10).toBeGreaterThan(5);
```

### `toThrow` matching

`toThrow` accepts:

- no argument — any throw passes;
- a string — thrown message contains the string;
- a `RegExp` — thrown message matches;
- an error constructor — thrown value is an instance of it;
- an `Error` instance — thrown message equals the instance message.

```js
expect(() => {
  throw new TypeError('bad type');
}).toThrow(TypeError);

expect(() => {
  throw new Error('boom');
}).toThrow(new Error('boom'));
```

If the received function returns a promise, use
`await expect(fn).rejects.toThrow(...)` instead.

### Subset and path matching

```js
expect({ id: 1, user: { name: 'Ada', role: 'admin' } }).toMatchObject({
  user: { name: 'Ada' },
});

expect({ user: { tags: ['a', 'b'] } }).toHaveProperty('user.tags[1]', 'b');
expect({ user: { tags: ['a', 'b'] } }).toHaveProperty(['user', 'tags', 0], 'a');

expect(0.1 + 0.2).toBeCloseTo(0.3);
expect(0.1 + 0.2).toBeCloseTo(0.3, 5);
```

## Asymmetric matchers

Asymmetric matchers stand in for values inside `toEqual`, `toStrictEqual`,
`toContain`, `toMatchObject`, `toHaveProperty`, and mock argument matchers.

```js
expect({ id: 1, name: 'Ada' }).toEqual({
  id: expect.any(Number),
  name: expect.stringContaining('Ad'),
});

expect({ id: 1, active: true }).toEqual(
  expect.objectContaining({ id: expect.any(Number) }),
);

expect([1, 2, 3]).toEqual(expect.arrayContaining([3, 1]));

expect('hello world').toEqual(expect.stringMatching(/^hello/));
expect({ value: null }).toEqual({ value: expect.anything() });
expect(0.30000000000000004).toEqual(expect.closeTo(0.3));
```

| Matcher                                 | Description                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `expect.any(Constructor)`               | Matches primitives or instances of `Constructor`. `String`, `Number`, `Boolean`, `BigInt`, `Symbol`, `Function`, and `Object` are supported, as are custom constructors. |
| `expect.anything()`                     | Matches any value except `null` and `undefined`.                                                                                                                         |
| `expect.objectContaining(object)`       | Matches an object containing at least the sample keys and values.                                                                                                        |
| `expect.arrayContaining(array)`         | Matches an array containing the sample elements in any order. Extra elements are allowed.                                                                                |
| `expect.stringContaining(string)`       | Matches a string containing the sample substring.                                                                                                                        |
| `expect.stringMatching(stringOrRegExp)` | Matches a string against the pattern.                                                                                                                                    |
| `expect.closeTo(number, digits?)`       | Matches a number within `10^-digits / 2`.                                                                                                                                |

## Mock matchers

These require the received value to be a mock created by `mock.fn()` or
`mock.spyOn()`.

| Matcher                               | Description                                                  |
| ------------------------------------- | ------------------------------------------------------------ |
| `toHaveBeenCalled()`                  | The mock was called at least once.                           |
| `toHaveBeenCalledTimes(n)`            | The mock was called exactly `n` times.                       |
| `toHaveBeenCalledWith(...args)`       | At least one call matches the arguments using deep equality. |
| `toHaveBeenLastCalledWith(...args)`   | The most recent call matches the arguments.                  |
| `toHaveBeenNthCalledWith(n, ...args)` | The `n`th call (1-based) matches the arguments.              |
| `toHaveReturned()`                    | The mock returned at least once without throwing.            |
| `toHaveReturnedWith(value)`           | At least one return value deep-equals `value`.               |
| `toHaveReturnedTimes(n)`              | The mock returned exactly `n` times.                         |

```js
import { mock, expect } from '@guchho/test';

const fn = mock.fn((value) => value * 2);
fn(1);
fn(2);

expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveBeenCalledWith(1);
expect(fn).toHaveBeenLastCalledWith(2);
expect(fn).toHaveBeenNthCalledWith(1, 1);
expect(fn).toHaveReturnedWith(4);
expect(fn).toHaveReturnedTimes(2);
```

## Snapshot matchers

| Matcher                            | Description                                            |
| ---------------------------------- | ------------------------------------------------------ |
| `toMatchSnapshot(hint?)`           | Compares against an external snapshot.                 |
| `toMatchInlineSnapshot(snapshot?)` | Compares against an inline literal in the test source. |

See [Snapshot Testing](./snapshot-testing.md).

## Negation

Use `.not` to invert any matcher:

```js
expect(1).not.toBe(2);
expect([1, 2]).not.toContain(3);
```

Matcher errors include the negated signature, for example `expect(received).not.toBe(expected)`.

## Async matchers

For promises, use `.resolves` or `.rejects` and `await` the assertion:

```js
await expect(Promise.resolve(42)).resolves.toBe(42);

await expect(Promise.reject(new Error('nope'))).rejects.toThrow('nope');
```

`.rejects` passes the rejection reason to the matcher:

```js
await expect(Promise.reject(new TypeError('bad'))).rejects.toBeInstanceOf(
  TypeError,
);
```

Use `.not` after `resolves`/`rejects` to negate:

```js
await expect(Promise.resolve(1)).resolves.not.toBe(2);
```

Rules:

- `.resolves` and `.rejects` require a promise or thenable; otherwise an
  `AssertionError` is thrown.
- A matcher that returns a promise in a synchronous assertion throws a
  `TypeError` asking you to use `resolves`/`rejects`.

## Soft assertions

`expect.soft(actual)` runs a matcher like `expect(actual)`, but records failures
instead of throwing so the rest of the test continues. Every recorded failure is
reported when the test finishes, and the test fails.

```js
it('checks several values', () => {
  expect.soft(response.status).toBe(200);
  expect.soft(response.body).toMatchObject({ ok: true });
});
```

Soft assertions support the same matchers as `expect`, including `.not`,
`.resolves`, and `.rejects`.

## Polling assertions

`expect.poll(callback, options?)` retries a matcher until it passes or the
timeout elapses. `timeout` defaults to 1000 ms and `interval` to 50 ms.

```js
await expect.poll(() => fetchStatus()).toBe('ready');

await expect.poll(() => value, { timeout: 5000, interval: 100 }).not.toBeNull();
```

The callback may return a value or a promise. Matcher failures are retried; the
last error is reported when the timeout is reached. `.not` is supported. Both
`timeout` and `interval` must be positive, finite numbers.

## Deep equality behavior

Deep equality supports:

- cycles;
- objects, arrays, and symbol keys;
- `Map` and `Set` (order-independent);
- `Date`, `RegExp`, boxed primitives;
- `Error` (name, message, and enumerable keys);
- `ArrayBuffer`, `SharedArrayBuffer`, and typed arrays;
- `Buffer` (as a `Uint8Array`).

`WeakMap`, `WeakSet`, and `Promise` are never deeply equal.

`toEqual` ignores enumerable keys whose value is `undefined`. `toStrictEqual`
keeps them and requires matching prototypes.

Asymmetric matchers are evaluated on the expected side at any depth, including
inside `Map` keys and values, `Set` values, and mock call arguments.

## Custom matchers

Register a matcher with `expect.extend`. A matcher receives the received value as
its first argument and runs with a matcher context as `this`. It must return
`{ pass, message }`.

```js
expect.extend({
  toBeEven(received) {
    if (typeof received !== 'number') {
      throw new TypeError('toBeEven expects a number.');
    }

    return {
      pass: received % 2 === 0,
      message: () =>
        `Expected ${this.utils.printReceived(received)} to be even.`,
    };
  },
});

expect(4).toBeEven();
expect(3).not.toBeEven();
```

Context available as `this`:

| Member                              | Description                             |
| ----------------------------------- | --------------------------------------- |
| `isNot`                             | `true` when `.not` is used.             |
| `mode`                              | `'sync'`, `'resolves'`, or `'rejects'`. |
| `equals(actual, expected, strict?)` | Deep equality helper.                   |
| `utils.stringify(value)`            | Deterministic value formatting.         |
| `utils.printReceived(value)`        | Format the received value.              |
| `utils.printExpected(value)`        | Format the expected value.              |
| `utils.diff(expected, received)`    | Produce a text diff.                    |

Reserved names `not`, `resolves`, and `rejects` cannot be registered. Custom
matchers are process-wide within a test worker.

## Custom equality tests

Add a custom equality test. Return `true`/`false` to decide, or `undefined` to
defer to the built-in comparison.

```js
const dispose = expect.addEqualityTest((actual, expected, equals) => {
  if (actual instanceof URL && expected instanceof URL) {
    return actual.href === expected.href;
  }

  return undefined;
});

expect(new URL('https://example.com')).toEqual(new URL('https://example.com'));

dispose();
```

`addEqualityTest` returns a function that removes the custom test.

## Assertion errors

A failed assertion throws `AssertionError` (exported from the package):

```js
import { AssertionError } from '@guchho/test';
```

Messages are formatted with the matcher signature, expected value, received
value, and, for deep equality, a line diff.
