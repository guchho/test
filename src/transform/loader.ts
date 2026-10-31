import { readFile } from 'node:fs/promises';
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
