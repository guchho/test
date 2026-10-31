import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base64Values =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

interface RawSourceMap {
  readonly version?: number;
  readonly sources?: readonly string[];
  readonly sourceRoot?: string;
  readonly sourcesContent?: readonly (string | null)[];
  readonly mappings?: string;
}

export interface SourceMapEntry {
  readonly generatedLine: number;
  readonly generatedColumn: number;
  readonly sourcePath: string;
  readonly originalLine: number;
  readonly originalColumn: number;
}

export interface ParsedSourceMap {
  readonly entries: readonly SourceMapEntry[];
  readonly contents: ReadonlyMap<string, string>;
}

function decodeValue(segment: string): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;

  for (const character of segment) {
    const digit = base64Values.indexOf(character);
    if (digit === -1) {
      throw new Error(`Invalid source map character "${character}".`);
    }

    const continuation = (digit & 32) !== 0;
    value += (digit & 31) << shift;

    if (continuation) {
      shift += 5;
      continue;
    }

    const negative = (value & 1) === 1;
    value >>>= 1;
    values.push(negative ? -value : value);
    value = 0;
    shift = 0;
  }

  if (shift !== 0) {
    throw new Error('Truncated source map segment.');
  }

  return values;
}

function inlineMap(source: string): RawSourceMap | undefined {
  const pattern =
    /\/\/[#@]\s*sourceMappingURL=data:application\/json[^,]*,([A-Za-z0-9+/=]+)\s*$/gm;
  let match: RegExpExecArray | null;
  let value: string | undefined;

  while ((match = pattern.exec(source)) !== null) {
    value = match[1];
  }

  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(
      Buffer.from(value, 'base64').toString('utf8'),
    ) as RawSourceMap;
  } catch {
    return undefined;
  }
}

function resolveSource(
  scriptPath: string,
  sourceRoot: string | undefined,
  source: string,
): string {
  if (source.startsWith('file:')) {
    return fileURLToPath(source);
  }

  if (path.isAbsolute(source)) {
    return path.normalize(source);
  }

  const root =
    sourceRoot === undefined || sourceRoot.length === 0
      ? ''
      : sourceRoot;

  return path.resolve(path.dirname(scriptPath), root, source);
}

function contentFor(
  sourcePath: string,
  sourcesContent: readonly (string | null)[] | undefined,
  index: number,
): string {
  const embedded = sourcesContent?.[index];
  if (typeof embedded === 'string') {
    return embedded;
  }

  return readFileSync(sourcePath, 'utf8');
}

export function parseSourceMap(
  scriptPath: string,
  source: string,
): ParsedSourceMap | undefined {
  const raw = inlineMap(source);
  if (
    raw === undefined ||
    raw.mappings === undefined ||
    raw.sources === undefined
  ) {
    return undefined;
  }

  const contents = new Map<string, string>();
  const entries: SourceMapEntry[] = [];

  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let nameIndex = 0;
  let generatedLine = 0;

  for (const line of raw.mappings.split(';')) {
    let generatedColumn = 0;

    if (line.length > 0) {
      for (const segment of line.split(',')) {
        if (segment.length === 0) {
          continue;
        }

        const values = decodeValue(segment);
        const generatedDelta = values[0];
        if (generatedDelta === undefined) {
          continue;
        }

        generatedColumn += generatedDelta;

        if (values.length === 1) {
          continue;
        }

        const sourceDelta = values[1];
        const lineDelta = values[2];
        const columnDelta = values[3];

        if (
          sourceDelta === undefined ||
          lineDelta === undefined ||
          columnDelta === undefined
        ) {
          continue;
        }

        sourceIndex += sourceDelta;
        originalLine += lineDelta;
        originalColumn += columnDelta;

        const nameDelta = values[4];
        if (nameDelta !== undefined) {
          nameIndex += nameDelta;
        }
        void nameIndex;

        const sourceName = raw.sources[sourceIndex];
        if (sourceName === undefined) {
          continue;
        }

        const sourcePath = resolveSource(
          scriptPath,
          raw.sourceRoot,
          sourceName,
        );

        if (!contents.has(sourcePath)) {
          try {
            contents.set(
              sourcePath,
              contentFor(sourcePath, raw.sourcesContent, sourceIndex),
            );
          } catch {
            continue;
          }
        }

        entries.push({
          generatedLine,
          generatedColumn,
          sourcePath,
          originalLine,
          originalColumn,
        });
      }
    }

    generatedLine += 1;
  }

  return { entries, contents };
}
