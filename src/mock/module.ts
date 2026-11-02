import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { generateModuleSource } from './generate.js';
import type { GeneratedModuleMock } from './generate.js';

type RegisteredModuleMock = GeneratedModuleMock;

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
let requireHookInstalled = false;
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
      if (fileName === null || fileName.length === 0) {
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

      return fileName.startsWith('file:') ? fileURLToPath(fileName) : fileName;
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
    const parent = currentTestFile ?? findCallerFile();
    const base = parent === undefined ? process.cwd() : path.dirname(parent);

    return path.resolve(base, specifier);
  }

  throw new TypeError(
    `mock.module only supports relative or absolute file paths. Received "${specifier}".`,
  );
}

function isValidExportName(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !reservedWords.has(name);
}

interface InlineResolveResult {
  readonly url: string;
  readonly shortCircuit?: boolean;
}

interface InlineLoadResult {
  readonly format?: string;
  readonly source?: string | ArrayBuffer;
  readonly shortCircuit?: boolean;
}

type NextResolve = (specifier: string, context: unknown) => InlineResolveResult;

type NextLoad = (url: string, context: unknown) => InlineLoadResult;

interface InlineHooks {
  readonly resolve?: (
    specifier: string,
    context: unknown,
    nextResolve: NextResolve,
  ) => InlineResolveResult;
  readonly load?: (
    url: string,
    context: unknown,
    nextLoad: NextLoad,
  ) => InlineLoadResult;
}

type RegisterHooks = (hooks: InlineHooks) => void;

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  return parsed.href;
}

function inlineResolve(
  specifier: string,
  context: unknown,
  nextResolve: NextResolve,
): InlineResolveResult {
  const result = nextResolve(specifier, context);

  if (!result.url.startsWith('file:')) {
    return result;
  }

  const parsed = new URL(result.url);
  if (parsed.searchParams.has('guchho-mock')) {
    return result;
  }

  const entry = registeredModules.get(normalizeUrl(result.url));
  if (entry === undefined) {
    return result;
  }

  parsed.searchParams.set('guchho-mock', entry.id);
  return { url: parsed.href, shortCircuit: true };
}

function inlineLoad(
  url: string,
  context: unknown,
  nextLoad: NextLoad,
): InlineLoadResult {
  if (!url.startsWith('file:')) {
    return nextLoad(url, context);
  }

  const parsed = new URL(url);
  const id = parsed.searchParams.get('guchho-mock');
  if (id === null) {
    return nextLoad(url, context);
  }

  const entry = registeredModules.get(normalizeUrl(url));
  if (entry === undefined || entry.id !== id) {
    return nextLoad(url, context);
  }

  return {
    format: 'module',
    source: generateModuleSource(entry),
    shortCircuit: true,
  };
}

function ensureLoader(): void {
  if (loaderRegistered) {
    return;
  }

  const registerHooks = (
    nodeModule as unknown as { registerHooks?: RegisterHooks }
  ).registerHooks;

  if (typeof registerHooks === 'function') {
    registerHooks({ resolve: inlineResolve, load: inlineLoad });
    loaderRegistered = true;
    return;
  }

  const directory = mkdtempSync(path.join(tmpdir(), 'guchho-module-mocks-'));
  registryPath = path.join(directory, 'registry.json');
  writeFileSync(registryPath, '{}');

  const register = (
    nodeModule as unknown as {
      register(
        specifier: string,
        options: { data: { registryPath: string } },
      ): void;
    }
  ).register;

  register(new URL('./loader.js', import.meta.url).href, {
    data: { registryPath },
  });

  loaderRegistered = true;
}

type RequireLoad = (
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
) => unknown;

interface CommonJsModuleApi {
  _load?: RequireLoad;
  _resolveFilename?: (request: string, parent: unknown) => string;
}

function installRequireHook(): void {
  if (requireHookInstalled) {
    return;
  }

  const commonJs = nodeModule.createRequire(import.meta.url)(
    'node:module',
  ) as CommonJsModuleApi;
  const originalLoad = commonJs._load;
  const resolveFilename = commonJs._resolveFilename;

  if (
    typeof originalLoad !== 'function' ||
    typeof resolveFilename !== 'function'
  ) {
    return;
  }

  commonJs._load = function (
    this: unknown,
    request: string,
    parent: unknown,
    isMain: boolean,
  ): unknown {
    let resolved: string | undefined;

    try {
      resolved = resolveFilename.call(commonJs, request, parent);
    } catch {
      resolved = undefined;
    }

    if (resolved !== undefined) {
      const entry = registeredModules.get(pathToFileURL(resolved).href);
      if (entry !== undefined) {
        const exports = getMainRegistry().get(entry.id);
        if (exports !== undefined) {
          return exports;
        }
      }
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  requireHookInstalled = true;
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
  installRequireHook();

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
