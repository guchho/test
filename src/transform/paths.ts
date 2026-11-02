import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import * as ts from 'typescript';

const resolutionExtensions = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
] as const;

interface AliasPattern {
  readonly pattern: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly wildcard: boolean;
  readonly targets: readonly string[];
}

export interface PathAliasResolver {
  readonly tsconfig: string;
  readonly baseUrl: string;
  resolve(specifier: string): string | undefined;
}

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveFile(candidate: string): string | undefined {
  if (isFile(candidate)) {
    return candidate;
  }

  const extension = path.extname(candidate);
  const withoutExtension =
    extension.length > 0
      ? candidate.slice(0, candidate.length - extension.length)
      : candidate;
  const typescriptEquivalents =
    extension === '.js'
      ? ['.ts', '.tsx']
      : extension === '.jsx'
        ? ['.tsx']
        : extension === '.mjs'
          ? ['.mts']
          : extension === '.cjs'
            ? ['.cts']
            : [];

  for (const equivalent of typescriptEquivalents) {
    const replacement = `${withoutExtension}${equivalent}`;
    if (isFile(replacement)) {
      return replacement;
    }
  }

  for (const extension of resolutionExtensions) {
    const withExtension = `${candidate}${extension}`;
    if (isFile(withExtension)) {
      return withExtension;
    }
  }

  if (isFile(path.join(candidate, 'index.ts'))) {
    return path.join(candidate, 'index.ts');
  }

  for (const extension of resolutionExtensions) {
    const indexed = path.join(candidate, `index${extension}`);
    if (isFile(indexed)) {
      return indexed;
    }
  }

  return undefined;
}

function createPattern(
  pattern: string,
  targets: readonly string[],
): AliasPattern {
  const wildcardIndex = pattern.indexOf('*');

  if (wildcardIndex === -1) {
    return {
      pattern,
      prefix: pattern,
      suffix: '',
      wildcard: false,
      targets,
    };
  }

  return {
    pattern,
    prefix: pattern.slice(0, wildcardIndex),
    suffix: pattern.slice(wildcardIndex + 1),
    wildcard: true,
    targets,
  };
}

function matchPattern(
  specifier: string,
  pattern: AliasPattern,
): string | undefined {
  if (!pattern.wildcard) {
    return specifier === pattern.pattern ? '' : undefined;
  }

  if (
    specifier.length < pattern.prefix.length + pattern.suffix.length ||
    !specifier.startsWith(pattern.prefix) ||
    !specifier.endsWith(pattern.suffix)
  ) {
    return undefined;
  }

  return specifier.slice(
    pattern.prefix.length,
    specifier.length - pattern.suffix.length,
  );
}

function readConfig(file: string):
  | {
      baseUrl: string;
      patterns: AliasPattern[];
    }
  | undefined {
  let read: ReturnType<typeof ts.readConfigFile>;

  try {
    read = ts.readConfigFile(file, ts.sys.readFile);
  } catch (error) {
    throw new Error(
      `Failed to read TypeScript configuration ${file}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  if (read.error !== undefined) {
    const message = ts.flattenDiagnosticMessageText(
      read.error.messageText,
      '\n',
    );
    throw new Error(
      `Failed to read TypeScript configuration ${file}: ${message}`,
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(file),
  );
  const options = parsed.options;
  const paths = options.paths;

  if (paths === undefined || Object.keys(paths).length === 0) {
    return undefined;
  }

  const baseUrl = options.baseUrl ?? path.dirname(file);
  const patterns = Object.entries(paths)
    .map(([pattern, targets]) =>
      createPattern(
        pattern,
        targets.map((target) => String(target)),
      ),
    )
    .sort((left, right) => right.prefix.length - left.prefix.length);

  return { baseUrl, patterns };
}

export function findTsconfig(cwd: string): string | undefined {
  const candidate = path.join(cwd, 'tsconfig.json');

  return isFile(candidate) ? candidate : undefined;
}

export function loadPathAliases(
  tsconfigPath: string | undefined,
  cwd: string,
): PathAliasResolver | undefined {
  const explicit =
    tsconfigPath === undefined ? undefined : path.resolve(cwd, tsconfigPath);
  const file = explicit ?? findTsconfig(cwd);

  if (file === undefined) {
    return undefined;
  }

  if (!existsSync(file)) {
    throw new Error(`TypeScript configuration file not found: ${file}`);
  }

  const config = readConfig(file);
  if (config === undefined) {
    return undefined;
  }

  const { baseUrl, patterns } = config;

  return {
    tsconfig: file,
    baseUrl,
    resolve(specifier: string): string | undefined {
      if (
        specifier.startsWith('.') ||
        specifier.startsWith('/') ||
        specifier.startsWith('file:') ||
        specifier.startsWith('node:') ||
        /^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier)
      ) {
        return undefined;
      }

      for (const pattern of patterns) {
        const wildcard = matchPattern(specifier, pattern);
        if (wildcard === undefined) {
          continue;
        }

        for (const target of pattern.targets) {
          const substituted = pattern.wildcard
            ? target.replace('*', wildcard)
            : target;
          const candidate = path.resolve(baseUrl, substituted);
          const resolved = resolveFile(candidate);

          if (resolved !== undefined) {
            return resolved;
          }
        }
      }

      return undefined;
    },
  };
}
