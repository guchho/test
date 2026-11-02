# Mocking

Import `mock` from `@guchho/test`:

```js
import { mock, expect } from '@guchho/test';
```

## Mock functions

```js
const callback = mock.fn();
callback('hello');

expect(callback).toHaveBeenCalled();
expect(callback).toHaveBeenCalledWith('hello');
expect(callback).toHaveBeenCalledTimes(1);
```

Provide an implementation:

```js
const add = mock.fn((a, b) => a + b);
expect(add(2, 3)).toBe(5);
```

### What a mock tracks

`fn.mock` exposes:

| Property              | Description                                        |
| --------------------- | -------------------------------------------------- |
| `calls`               | Array of argument arrays, one per call.            |
| `results`             | Array of `{ type: 'return'                         | 'throw', value }`. |
| `instances`           | Instances created with `new`.                      |
| `invocationCallOrder` | Monotonic invocation numbers shared by all mocks.  |
| `lastCall`            | Arguments of the most recent call, or `undefined`. |

### Controlling a mock

```js
const fn = mock.fn();

fn.mockReturnValue(100);
fn.mockReturnValueOnce(200);
fn.mockResolvedValue({ ok: true });
fn.mockResolvedValueOnce({ ok: 'once' });
fn.mockRejectedValue(new Error('failed'));
fn.mockRejectedValueOnce(new Error('once'));
fn.mockImplementation(() => 'mocked');
fn.mockImplementationOnce(() => 'temporary');
```

One-time implementations are consumed in order before the persistent
implementation. All control methods return the mock for chaining.

### Resetting and restoring

| Method                                   | Effect                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `fn.mockClear()` / `mock.clearAll()`     | Clears calls, results, instances, and invocation order. Keeps implementations. |
| `fn.mockReset()` / `mock.resetAll()`     | Clears state and restores the original implementation passed to `mock.fn()`.   |
| `fn.mockRestore()` / `mock.restoreAll()` | Restores the original property for spies, then resets state.                   |

```js
const fn = mock.fn(() => 1);
fn();
fn.mockClear();
expect(fn).not.toHaveBeenCalled();

fn.mockReset();
expect(fn()).toBe(1);
```

## Spies

`mock.spyOn(object, key)` wraps an existing function property and records calls.
The original behavior is preserved by default.

```js
const logger = {
  log(message) {
    return `logged: ${message}`;
  },
};

const spy = mock.spyOn(logger, 'log');
logger.log('hi');

expect(spy).toHaveBeenCalledWith('hi');

spy.mockRestore();
```

Spying requires:

- the property to exist (own or inherited);
- the descriptor to be configurable;
- the property to be a data property containing a function.

Accessors and non-configurable properties are rejected with a `TypeError`.

`mockRestore()` restores the original own descriptor, or removes an inherited
override so the prototype method is visible again.

## Constructor mocks

Mocks support `new`:

```js
const Ctor = mock.fn(function () {
  this.value = 1;
});

const instance = new Ctor();
expect(Ctor.mock.instances[0]).toBe(instance);
```

For a `spyOn` constructor, `new` delegates to the original constructor.

## Fake timers

`mock` includes a fake timer implementation that replaces `setTimeout`,
`clearTimeout`, `setInterval`, `clearInterval`, `setImmediate`,
`clearImmediate`, and `Date`.

```js
it('retries after a delay', () => {
  const fn = mock.fn();

  mock.useFakeTimers();
  setTimeout(fn, 1000);

  mock.advanceTimersByTime(999);
  expect(fn).not.toHaveBeenCalled();

  mock.advanceTimersByTime(1);
  expect(fn).toHaveBeenCalledTimes(1);

  mock.useRealTimers();
});
```

| Method                       | Description                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `useFakeTimers(options?)`    | Replaces timers. Options: `now`, `toFake`, `loopLimit`.                            |
| `useRealTimers()`            | Restores the original timer globals and `Date`.                                    |
| `advanceTimersByTime(ms)`    | Runs due timers and advances the clock.                                            |
| `advanceTimersToNextTimer()` | Runs only the next scheduled timer and returns the advanced milliseconds.          |
| `runAllTimers()`             | Runs timers, including newly scheduled ones, until none remain.                    |
| `runOnlyPendingTimers()`     | Runs timers pending at the time of the call, without running newly scheduled ones. |
| `setSystemTime(time)`        | Sets the fake `Date` clock without firing timers.                                  |
| `getTimerCount()`            | Number of pending timers.                                                          |
| `clearAllTimers()`           | Discards all pending timers.                                                       |
| `now()`                      | Current fake time, or the real `Date.now()` when timers are real.                  |
| `isFakeTimers()`             | Whether fake timers are installed.                                                 |

Use `toFake` to replace only selected globals:

```js
mock.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
```

`loopLimit` defaults to `100000` and prevents an interval or recursive timer
from running forever. Always call `useRealTimers()` in cleanup (for example in
`afterEach`) when fake timers are enabled.

## Mock matchers

Mock assertions support call history and return values:

```js
const fn = mock.fn((value) => value * 2);
fn(1);
fn(2);

expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveBeenCalledWith(1);
expect(fn).toHaveBeenLastCalledWith(2);
expect(fn).toHaveBeenNthCalledWith(1, 1);
expect(fn).toHaveReturned();
expect(fn).toHaveReturnedWith(4);
expect(fn).toHaveReturnedTimes(2);
```

Call arguments use deep equality, so asymmetric matchers work:

```js
fn({ id: 1, name: 'Ada' });
expect(fn).toHaveBeenLastCalledWith(
  expect.objectContaining({ id: expect.any(Number) }),
);
```

See [Assertions](./assertions.md#mock-matchers) for the complete matcher list.

## Module mocking

`mock.module(specifier, factory)` replaces an ESM module for subsequent dynamic
imports in the same test file.

```js
mock.module('./api.js', () => ({
  getUser: () => ({ id: 1, name: 'Test User' }),
}));

const api = await import('./api.js');
const user = api.getUser();
```

Rules:

- Register the mock before importing the module. Use dynamic `import()`.
- The specifier must be a relative path, an absolute path, or a `file:` URL.
  Bare package names are rejected.
- The target file must exist.
- The factory must return an object.
- Export names must be valid JavaScript identifiers. `default` is allowed.

CommonJS `require()` calls are intercepted as well:

```js
mock.module('./api.cjs', () => ({
  version: 'mocked',
}));

const api = require('./api.cjs');
```

Supported scenarios:

- Existing ESM files with named exports and an optional default export.
- Existing CommonJS files loaded through `require()`.
- Relative, absolute, and `file:` URL specifiers.
- Per-test-file isolation when run through the CLI.

Limitations:

- Static imports evaluated before the `mock.module()` call cannot be affected.
- Factory results are captured at registration time; later mutations of the
  returned object are not reflected.
- Module mocks are reset between test files when run through the CLI.

## Types

`mock` is typed with argument and return type parameters:

```ts
const fn = mock.fn<[value: string], number>();
fn.mockReturnValue(1);
```

`MockFunction`, `MockState`, `MockResult`, and `MockApi` are exported types.
