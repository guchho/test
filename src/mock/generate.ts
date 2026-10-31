export interface GeneratedModuleMock {
  readonly id: string;
  readonly exports: readonly string[];
}

export function generateModuleSource(entry: GeneratedModuleMock): string {
  const lines = [
    'const __guchhoRegistry = globalThis[Symbol.for("@guchho/test/mock-module-registry")];',
    `const __guchhoExports = __guchhoRegistry?.get(${JSON.stringify(entry.id)});`,
    `if (__guchhoExports === undefined) {`,
    `  throw new Error("Guchho module mock ${entry.id} is not registered. Call mock.module() before importing the mocked module.");`,
    '}',
  ];

  for (const name of entry.exports) {
    if (name === 'default') {
      lines.push('export default __guchhoExports["default"];');
      continue;
    }

    lines.push(
      `export const ${name} = __guchhoExports[${JSON.stringify(name)}];`,
    );
  }

  return lines.join('\n');
}
