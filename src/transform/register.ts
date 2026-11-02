import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
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

type NextLoad = (url: string, context: unknown) => LoadResult;
type NextResolve = (specifier: string, context: unknown) => ResolveResult;

interface InlineHooks {
  readonly resolve?: (
    specifier: string,
    context: unknown,
    nextResolve: NextResolve,
  ) => ResolveResult;
  readonly load?: (
    url: string,
    context: unknown,
    nextLoad: NextLoad,
  ) => LoadResult;
}

type RegisterHooks = (hooks: InlineHooks) => void;

export interface LoaderOptions {
  readonly cwd?: string;
  readonly tsconfig?: string | undefined;
}

let registered = false;
let pathAliases: PathAliasResolver | undefined;

function inlineResolve(
  specifier: string,
  context: unknown,
  nextResolve: NextResolve,
): ResolveResult {
  if (pathAliases !== undefined) {
    const resolved = pathAliases.resolve(specifier);
    if (resolved !== undefined) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}

function inlineLoad(
  url: string,
  context: unknown,
  nextLoad: NextLoad,
): LoadResult {
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

  const source = readFileSync(filePath, 'utf8');
  const transformed = transformTypeScript(source, filePath);
  recordTransformedSource(url, transformed);

  return {
    format: moduleFormatFor(filePath),
    source: transformed,
    shortCircuit: true,
  };
}

export function registerTypeScriptLoader(options: LoaderOptions = {}): void {
  if (options.tsconfig !== undefined || options.cwd !== undefined) {
    pathAliases = loadPathAliases(
      options.tsconfig,
      options.cwd ?? process.cwd(),
    );
  }

  if (registered) {
    return;
  }

  registered = true;

  const registerHooks = (
    nodeModule as unknown as { registerHooks?: RegisterHooks }
  ).registerHooks;

  if (typeof registerHooks === 'function') {
    registerHooks({ resolve: inlineResolve, load: inlineLoad });
    return;
  }

  const register = (
    nodeModule as unknown as {
      register(specifier: string, options?: { data?: unknown }): void;
    }
  ).register;

  register(new URL('./loader.js', import.meta.url).href, {
    data: { tsconfig: options.tsconfig, cwd: options.cwd },
  });
}
