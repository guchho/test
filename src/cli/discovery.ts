import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { matchesAnyGlob } from '../utils/glob.js';

export interface DiscoveryOptions {
  readonly cwd: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function isExcluded(relativePath: string, exclude: readonly string[]): boolean {
  return (
    matchesAnyGlob(exclude, relativePath) ||
    matchesAnyGlob(exclude, `${relativePath}/`)
  );
}

async function walk(
  directory: string,
  relativeDirectory: string,
  options: DiscoveryOptions,
  files: string[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );

  for (const entry of entries) {
    const relativePath =
      relativeDirectory.length > 0
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;

    if (entry.isDirectory()) {
      if (isExcluded(relativePath, options.exclude)) {
        continue;
      }

      await walk(
        path.join(directory, entry.name),
        relativePath,
        options,
        files,
      );
      continue;
    }

    if (
      entry.isFile() &&
      !isExcluded(relativePath, options.exclude) &&
      matchesAnyGlob(options.include, relativePath)
    ) {
      files.push(toPosixPath(relativePath));
    }
  }
}

export async function discoverTestFiles(
  options: DiscoveryOptions,
): Promise<string[]> {
  const files: string[] = [];
  await walk(options.cwd, '', options, files);
  files.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return files;
}
