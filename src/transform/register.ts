import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';

import { recordTransformedSource } from '../coverage/sources.js';

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

type NextLoad = (url: string, context: unknown) => LoadResult;

interface InlineHooks {
  readonly load?: (
    url: string,
    context: unknown,
    nextLoad: NextLoad,
  ) => LoadResult;
}

type RegisterHooks = (hooks: InlineHooks) => void;

let registered = false;

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

export function registerTypeScriptLoader(): void {
  if (registered) {
    return;
  }

  registered = true;

  const registerHooks = (
    nodeModule as unknown as { registerHooks?: RegisterHooks }
  ).registerHooks;

  if (typeof registerHooks === 'function') {
    registerHooks({ load: inlineLoad });
    return;
  }

  const register = (
    nodeModule as unknown as { register(specifier: string): void }
  ).register;

  register(new URL('./loader.js', import.meta.url).href);
}
