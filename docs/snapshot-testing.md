---
title: Snapshot Testing
description: Capture and compare external and inline snapshots with deterministic serialization.
date: "2026-11-02"
---

# Snapshot Testing

Snapshots capture a serialized value and compare it on later runs.

Snapshots are useful for structured output, rendered markup, and large values
that are easier to review as a file than as inline assertions. They are not a
substitute for focused assertions about behavior.

```js
import { expect, it } from '@guchho/test';

it('matches a stored value', () => {
  expect({ id: 1, name: 'Ada' }).toMatchSnapshot();
});
```

## External snapshots

External snapshots are stored next to the test file:

```text
__snapshots__/<test-file-name>.snap
```

For example, `src/user.test.js` writes `src/__snapshots__/user.test.js.snap`.

The file is a JSON object mapping snapshot keys to serialized strings. Keys are
sorted when written so the file is stable.

### Snapshot keys

Keys are derived from the full test name and a counter:

- without a hint: `<full test name> <n>`;
- with a hint: `<full test name>: <hint>`;
- duplicate keys get a numeric suffix.

```js
it('renders a user', () => {
  expect(user).toMatchSnapshot();
  expect(user).toMatchSnapshot('compact');
});
```

### Creating and updating

Run with `--update` (or `-u`) to create missing external snapshots and update
changed ones:

```bash
guchho-test run --update
```

Without `--update`, a missing snapshot fails with a message telling you to rerun
with `--update`.

## Inline snapshots

Inline snapshots are written into the test source:

```js
it('matches an inline value', () => {
  expect({ id: 1, name: 'Ada' }).toMatchInlineSnapshot();
});
```

Run with `--update` to insert the literal:

```js
it('matches an inline value', () => {
  expect({ id: 1, name: 'Ada' }).toMatchInlineSnapshot(
    '{\n  id: 1,\n  name: "Ada",\n}',
  );
});
```

Inline update works for JavaScript and TypeScript files, using the call-site
stack frame and the TypeScript parser to locate and replace the snapshot
argument.

Rules:

- Without an argument and without `--update`, an inline snapshot fails.
- With an argument, the serialized received value must equal the literal.
- Updates only apply when not using `.not`.

## Property matchers

Pass a properties object as the first argument to match only some fields while
storing stable placeholders for the rest. This is useful for values that change
between runs, such as generated IDs or timestamps.

```js
it('creates a user', () => {
  const user = {
    id: Math.random(),
    createdAt: new Date(),
    name: 'Ada',
  };

  expect(user).toMatchSnapshot({
    id: expect.any(Number),
    createdAt: expect.any(Date),
  });
});
```

The stored snapshot contains placeholders such as `Any<Number>` and
`Any<Date>`; the other fields are serialized normally. On subsequent runs each
property matcher is checked against the received value before the snapshot is
compared. A failed property match reports the failing property and both values.

Inline snapshots accept the same first argument:

```js
expect(user).toMatchInlineSnapshot({
  id: expect.any(Number),
});
```

With `--update`, the properties object is preserved and only the snapshot
argument is written or replaced.

Placeholders are chosen from the matcher: `Any<Number>`, `Any<String>`,
`Any<Boolean>`, `Any<Object>`, `Any<Array>`, `Any<Anything>`, or
`Any<Matcher>` for other asymmetric matchers.

## Obsolete snapshots

Snapshots that are no longer referenced by a test file are reported after the
file finishes:

```text
Warning: obsolete snapshot "renders a user 2" in "src/user.test.js". Run with --update to remove it.
```

Obsolete snapshots never fail the run. Running with `--update` removes them and
prints each removal. Pruning is skipped when `--filter` or `--testNamePattern`
is used so a partial run cannot delete snapshots that were simply not selected.

## Serialization

Values are serialized deterministically:

- object keys are sorted;
- `Map` entries are sorted by rendered key;
- arrays and nested objects are indented;
- circular references render as `[Circular]`;
- special values render explicitly: `Date(...)`, `RegExp`, `Error`, `Map {}`,
  `Set {}`, `Buffer [...]`, typed arrays, `ArrayBuffer`, `[Promise]`,
  `[Function: name]`, `[Circular]`.

Because output is deterministic and key-sorted, snapshots are stable across runs
and platforms.

## Diff output

Mismatches show the snapshot key, the expected snapshot, the received value, and
a line diff.

## Negation

`.not` works with both matchers and passes when the value does not match:

```js
expect(value).not.toMatchSnapshot();
expect(value).not.toMatchInlineSnapshot('...');
```

## Best practices

- Keep snapshots small enough to review in a pull request.
- Commit external snapshot files with the tests that produce them.
- Use property matchers for values that legitimately change between runs.
- Review snapshot updates instead of accepting them blindly.
- Remove snapshot files when the related tests are deleted.

## Snapshots and workers

Each test file runs in its own worker, so snapshot state and external snapshot
writes are scoped to that file.

## Related

- [Assertions](./assertions.md)
- [Writing Tests](./writing-tests.md)
- [Configuration](./configuration.md)
- [CLI Reference](./cli.md)
