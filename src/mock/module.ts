import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface RegisteredModuleMock {
  readonly id: string;
  readonly exports: readonly string[];
}

const registrySymbol = Symbol.for('@guchho/test/mock-module-registry');

const reservedWords = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

let currentTestFile: string | undefined;
let registryPath: string | undefined;
let loaderRegistered = false;
let mockCounter = 0;

const registeredModules = new Map<string, RegisteredModuleMock>();

type RegistryMap = Map<string, Record<string, unknown>>;

function getMainRegistry(): RegistryMap {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  const existing = holder[registrySymbol];
  if (existing instanceof Map) {
    return existing as RegistryMap;
  }

  const created: RegistryMap = new Map();
  holder[registrySymbol] = created;
  return created;
}

function findCallerFile(): string | undefined {
  const originalPrepare = Error.prepareStackTrace;
  const originalLimit = Error.stackTraceLimit;

  try {
    Error.stackTraceLimit = 50;
    Error.prepareStackTrace = (_error, stack): NodeJS.CallSite[] => stack;
    const error = new Error();
    const stack = error.stack as unknown as NodeJS.CallSite[];

    for (const callSite of stack) {
      const fileName = callSite.getFileName();
      if (fileName === undefined || fileName.length === 0) {
        continue;
      }

      if (
        fileName.includes('/src/mock/module.') ||
        fileName.includes('\\src\\mock\\module.') ||
        fileName.includes('/dist/mock/module.') ||
        fileName.includes('\\dist\\mock\\module.')
      ) {
        continue;
      }

      return fileName.startsWith('file:')
        ? fileURLToPath(fileName)
        : fileName;
    }
  } finally {
    Error.prepareStackTrace = originalPrepare;
    Error.stackTraceLimit = originalLimit;
  }

  return undefined;
}

function resolveTarget(specifier: string): string {
  if (typeof specifier !== 'string' || specifier.trim().length === 0) {
    throw new TypeError('mock.module expects a non-empty module specifier.');
  }

  if (specifier.startsWith('file:')) {
    return fileURLToPath(specifier);
  }

  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    const parent = currentTestFile ?? findCallerFile() ?? process.cwd();
    const base = existsSync(parent) && !parent.endsWith(path.sep)
      ? path.dirname(parent)
      : parent;

    return path.resolve(base, specifier);
  }

  throw new TypeError(
    `mock.module only supports relative or absolute file paths. Received "${specifier}".`,
  );
}

function isValidExportName(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !reservedWords.has(name);
}

function ensureLoader(): void {
  if (loaderRegistered) {
    return;
  }

  const directory = mkdtempSync(path.join(tmpdir(), 'guchho-module-mocks-'));
  registryPath = path.join(directory, 'registry.json');
  writeFileSync(registryPath, '{}');

  register(new URL('./loader.js', import.meta.url).href, {
    data: { registryPath },
  });

  loaderRegistered = true;
}

function writeRegistry(): void {
  if (registryPath === undefined) {
    return;
  }

  const serialized = Object.fromEntries(registeredModules);
  writeFileSync(registryPath, JSON.stringify(serialized));
}

function mockModule(
  specifier: string,
  factory: () => Record<string, unknown>,
): void {
  if (typeof factory !== 'function') {
    throw new TypeError('mock.module expects a factory function.');
  }

  const target = resolveTarget(specifier);

  if (!existsSync(target)) {
    throw new TypeError(
      `Cannot mock module "${specifier}": no file exists at ${target}.`,
    );
  }

  ensureLoader();

  const exports = factory();
  if (exports === null || typeof exports !== 'object') {
    throw new TypeError(
      `mock.module factory for "${specifier}" must return an object.`,
    );
  }

  const exportNames = Object.keys(exports);

  for (const name of exportNames) {
    if (name === 'default') {
      continue;
    }

    if (!isValidExportName(name)) {
      throw new TypeError(
        `Cannot mock module "${specifier}": export "${name}" is not a valid JavaScript identifier.`,
      );
    }
  }

  const url = pathToFileURL(target).href;
  const registry = getMainRegistry();
  const previous = registeredModules.get(url);
  if (previous !== undefined) {
    registry.delete(previous.id);
  }

  mockCounter += 1;
  const id = String(mockCounter);

  registry.set(id, exports);
  registeredModules.set(url, { id, exports: exportNames });
  writeRegistry();
}

export function resetModuleMocks(): void {
  const registry = getMainRegistry();

  for (const entry of registeredModules.values()) {
    registry.delete(entry.id);
  }

  registeredModules.clear();
  writeRegistry();
}

export function setCurrentTestFile(file: string): void {
  currentTestFile = path.resolve(file);
}

export { mockModule };
