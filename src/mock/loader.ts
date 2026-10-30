import { readFileSync } from 'node:fs';

interface LoaderData {
  readonly registryPath?: unknown;
}

interface ModuleMockEntry {
  readonly id: string;
  readonly exports: readonly string[];
}

type ModuleRegistry = Record<string, ModuleMockEntry>;

let registryPath: string | undefined;

export function initialize(data: LoaderData): void {
  if (typeof data.registryPath === 'string') {
    registryPath = data.registryPath;
  }
}

function readRegistry(): ModuleRegistry {
  if (registryPath === undefined) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(registryPath, 'utf8'));
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as ModuleRegistry;
    }
  } catch {
    return {};
  }

  return {};
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  return parsed.href;
}

function generateSource(entry: ModuleMockEntry): string {
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

export async function resolve(
  specifier: string,
  context: unknown,
  nextResolve: (
    specifier: string,
    context: unknown,
  ) => Promise<{ url: string }>,
): Promise<{ url: string; shortCircuit?: boolean }> {
  const result = await nextResolve(specifier, context);

  if (result.url.startsWith('file:')) {
    const parsed = new URL(result.url);
    if (parsed.searchParams.has('guchho-mock')) {
      return result;
    }
  }

  const key = normalizeUrl(result.url);
  const entry = readRegistry()[key];

  if (entry === undefined) {
    return result;
  }

  const mocked = new URL(result.url);
  mocked.searchParams.set('guchho-mock', entry.id);
  return { url: mocked.href, shortCircuit: true };
}

export async function load(
  url: string,
  context: unknown,
  nextLoad: (
    url: string,
    context: unknown,
  ) => Promise<{ format?: string; source?: string | ArrayBuffer }>,
): Promise<{
  format?: string;
  source?: string | ArrayBuffer;
  shortCircuit?: boolean;
}> {
  if (!url.startsWith('file:')) {
    return nextLoad(url, context);
  }

  const parsed = new URL(url);
  const id = parsed.searchParams.get('guchho-mock');
  if (id === null) {
    return nextLoad(url, context);
  }

  const entry = readRegistry()[normalizeUrl(url)];
  if (entry === undefined || entry.id !== id) {
    return nextLoad(url, context);
  }

  return {
    format: 'module',
    source: generateSource(entry),
    shortCircuit: true,
  };
}
