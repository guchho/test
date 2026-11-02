import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isTransformableFile,
  moduleFormatFor,
  transformTypeScript,
} from '../dist/transform/typescript.js';

test('recognises transformable extensions', () => {
  for (const file of ['a.ts', 'a.mts', 'a.cts', 'a.tsx', 'a.jsx']) {
    assert.equal(isTransformableFile(file), true, file);
  }

  for (const file of ['a.js', 'a.mjs', 'a.cjs', 'a.json', 'a.txt']) {
    assert.equal(isTransformableFile(file), false, file);
  }
});

test('selects the correct module format', () => {
  assert.equal(moduleFormatFor('/tmp/a.cts'), 'commonjs');
  assert.equal(moduleFormatFor('/tmp/a.ts'), 'module');
  assert.equal(moduleFormatFor('/tmp/a.mts'), 'module');
  assert.equal(moduleFormatFor('/tmp/a.tsx'), 'module');
  assert.equal(moduleFormatFor('/tmp/a.jsx'), 'module');
});

test('strips TypeScript syntax and emits a source map', () => {
  const output = transformTypeScript(
    'const value: number = 1;\nexport { value };\n',
    '/tmp/example.ts',
  );

  assert.doesNotMatch(output, /: number/);
  assert.match(output, /export \{ value \}/);
  assert.match(output, /sourceMappingURL=data:application\/json/);
});

test('transforms .cts files to CommonJS', () => {
  const output = transformTypeScript(
    "import { value } from './dep.js';\nexport const result: number = value;\n",
    '/tmp/example.cts',
  );

  assert.match(output, /require\(/);
  assert.match(output, /exports\.result/);
  assert.doesNotMatch(output, /^import /m);
});

test('transforms JSX using the classic React runtime', () => {
  const output = transformTypeScript(
    'const node = <div>hello</div>;\nexport { node };\n',
    '/tmp/example.tsx',
  );

  assert.match(output, /React\.createElement\("div", null, "hello"\)/);
});

test('throws a SyntaxError for invalid TypeScript syntax', () => {
  assert.throws(
    () => transformTypeScript('const value: = 1;\n', '/tmp/broken.ts'),
    (error) => {
      assert.ok(error instanceof SyntaxError);
      assert.match(error.message, /broken\.ts/);
      return true;
    },
  );
});
