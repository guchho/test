# Snapshot Testing

Snapshots capture a serialized value and compare it on later runs.

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
    "{\n  id: 1,\n  name: \"Ada\",\n}",
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

## Snapshots and workers

Each test file runs in its own worker, so snapshot state and external snapshot
writes are scoped to that file.
