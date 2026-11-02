import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';

const sourceExtensions = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
];

const transformExtensionMap: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx', '.mts', '.cts'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

export function normalizeWatchPath(filePath: string): string {
  const absolute = path.resolve(filePath);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function candidatePaths(target: string): string[] {
  const candidates = [target];
  const extension = path.extname(target);
  const mapped = transformExtensionMap[extension];

  if (mapped !== undefined) {
    const base = target.slice(0, target.length - extension.length);
    for (const replacement of mapped) {
      candidates.push(`${base}${replacement}`);
    }
  }

  if (extension.length === 0) {
    for (const candidateExtension of sourceExtensions) {
      candidates.push(`${target}${candidateExtension}`);
    }

    for (const candidateExtension of sourceExtensions) {
      candidates.push(path.join(target, `index${candidateExtension}`));
    }
  }

  return candidates;
}

async function resolveSpecifier(
  specifier: string,
  fromFile: string,
): Promise<string | undefined> {
  if (
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !specifier.startsWith('file:')
  ) {
    return undefined;
  }

  const withoutQuery = specifier.split('?')[0] ?? specifier;
  const target = withoutQuery.startsWith('file:')
    ? fileURLToPath(withoutQuery)
    : path.resolve(path.dirname(fromFile), withoutQuery);

  for (const candidate of candidatePaths(target)) {
    if (await isFile(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function isSourceFile(filePath: string): boolean {
  return sourceExtensions.includes(path.extname(filePath));
}

async function scanFile(filePath: string, visited: Set<string>): Promise<void> {
  const normalized = normalizeWatchPath(filePath);

  if (visited.has(normalized) || !isSourceFile(filePath)) {
    return;
  }

  visited.add(normalized);

  let source: string;
  try {
    source = await readFile(filePath, 'utf8');
  } catch {
    return;
  }

  const info = ts.preProcessFile(source, true, true);

  for (const imported of info.importedFiles) {
    const resolved = await resolveSpecifier(imported.fileName, filePath);
    if (resolved !== undefined) {
      await scanFile(resolved, visited);
    }
  }
}

export async function collectDependencies(
  testFiles: readonly string[],
): Promise<Map<string, Set<string>>> {
  const graph = new Map<string, Set<string>>();

  for (const testFile of testFiles) {
    const visited = new Set<string>();
    await scanFile(testFile, visited);

    const key = normalizeWatchPath(testFile);
    visited.delete(key);
    graph.set(key, visited);
  }

  return graph;
}

export function affectedTests(
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  changed: ReadonlySet<string>,
): string[] {
  const affected: string[] = [];

  for (const [testFile, dependencies] of graph) {
    if (changed.has(testFile)) {
      affected.push(testFile);
      continue;
    }

    for (const dependency of dependencies) {
      if (changed.has(dependency)) {
        affected.push(testFile);
        break;
      }
    }
  }

  return affected.sort();
}
