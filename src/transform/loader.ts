import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { recordTransformedSource } from '../coverage/sources.js';
import { loadPathAliases } from './paths.js';
import type { PathAliasResolver } from './paths.js';
import {
  isTransformableFile,
  moduleFormatFor,
  transformTypeScript,
} from './typescript.js';

interface LoadResult {
  readonly format?: string;
  readonly source?: string | ArrayBuffer;
  readonly shortCircuit?: boolean;
}

interface ResolveResult {
  readonly url: string;
  readonly shortCircuit?: boolean;
}

let pathAliases: PathAliasResolver | undefined;

export function initialize(data: unknown): void {
  if (data === null || typeof data !== 'object') {
    return;
  }

  const options = data as { cwd?: unknown; tsconfig?: unknown };
  const cwd = typeof options.cwd === 'string' ? options.cwd : process.cwd();
  const tsconfig =
    typeof options.tsconfig === 'string' ? options.tsconfig : undefined;

  try {
    pathAliases = loadPathAliases(tsconfig, cwd);
  } catch {
    pathAliases = undefined;
  }
}

export async function resolve(
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => Promise<ResolveResult>,
): Promise<ResolveResult> {
  if (pathAliases !== undefined) {
    const resolved = pathAliases.resolve(specifier);
    if (resolved !== undefined) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}

export async function load(
  url: string,
  context: unknown,
  nextLoad: (url: string, context: unknown) => Promise<LoadResult>,
): Promise<LoadResult> {
  if (!url.startsWith('file:')) {
    return nextLoad(url, context);
  }

  const parsed = new URL(url);
  if (parsed.searchParams.has('guchho-mock')) {
    return nextLoad(url, context);
  }

  const filePath = fileURLToPath(url);
  if (!isTransformableFile(filePath)) {
    return nextLoad(url, context);
  }

  const source = await readFile(filePath, 'utf8');
  const transformed = transformTypeScript(source, filePath);
  recordTransformedSource(url, transformed);

  return {
    format: moduleFormatFor(filePath),
    source: transformed,
    shortCircuit: true,
  };
}
