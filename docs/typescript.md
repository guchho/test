# TypeScript and JSX

Guchho Test supports JavaScript, TypeScript, and JSX/TSX test files.

## Supported extensions

| Extension | Module format | Transformation |
|---|---|---|
| `.js` | ESM | none |
| `.mjs` | ESM | none |
| `.cjs` | CommonJS | none |
| `.ts` | ESM | TypeScript → ESM |
| `.mts` | ESM | TypeScript → ESM |
| `.cts` | CommonJS | TypeScript → CommonJS |
| `.jsx` | ESM | JSX → `React.createElement` |
| `.tsx` | ESM | TypeScript + JSX → ESM |

## How transformation works

When the CLI starts, it registers a Node.js loader hook. Transformable files are
read, transpiled with the TypeScript compiler, and supplied to Node.js with an
inline source map.

Configuration:

- target: ES2022;
- module: ESNext for ESM files, CommonJS for `.cts`;
- JSX: classic runtime (`React.createElement`);
- `isolatedModules: true`;
- source maps with inline sources.

Transformation diagnostics are reported as syntax errors with file, line, and
column.

## Type checking

Transformation does not type-check. Run type checking separately, for example:

```bash
npx tsc --noEmit
```

This project uses a strict `tsconfig.json` and a `tsconfig.build.json` for
declarations.

## Source maps

Inline source maps let stack traces and coverage point at original source lines,
including for TypeScript and TSX files. Source-map remapping is used by the
coverage pipeline.

## JSX

JSX uses the classic runtime. A `React.createElement` implementation must be in
scope, or you can provide a JSX factory through your own setup. Example with a
minimal factory:

```tsx
function createElement(type, props, ...children) {
  return { type, props, children };
}

it('renders', () => {
  const element = <div>Hello</div>;
  expect(element.type).toBe('div');
});
```

## Snapshots in TypeScript

Inline snapshot updates locate the call in the original source using the
TypeScript parser and replace the argument in place. This works for `.ts` and
`.tsx` files.

## CommonJS

`.cts` files are transformed to CommonJS. Other transformed files are ESM. Note
that module mocking (`mock.module`) targets ESM imports.

## Declaration files

The build emits TypeScript declarations (`.d.ts`) alongside compiled JavaScript
under `dist/`. Consumers get types through the package export map:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./config": {
      "types": "./dist/config/index.d.ts",
      "default": "./dist/config/index.js"
    }
  }
}
```

## Requirements

- Node.js `>=20.19.0` (required for stable loader behavior used by the
  transformer and module mocks).
- TypeScript `^5.7.0` is used by the transformer.
