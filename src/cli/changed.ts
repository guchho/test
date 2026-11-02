import { execFile } from 'node:child_process';
import path from 'node:path';

import {
  affectedTests,
  collectDependencies,
  normalizeWatchPath,
} from '../watch/dependencies.js';
import { CliError } from './parser.js';

function git(
  args: readonly string[],
  cwd: string,
  allowFailure = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error !== null) {
          if (allowFailure) {
            resolve('');
            return;
          }

          const detail = stderr.trim() || error.message;
          reject(
            new CliError(
              `Unable to determine changed files with git: ${detail}`,
            ),
          );
          return;
        }

        resolve(stdout);
      },
    );
  });
}

function splitNull(value: string): string[] {
  return value.split('\0').filter((entry) => entry.length > 0);
}

export async function changedFiles(
  cwd: string,
  since: string | undefined,
): Promise<string[]> {
  await git(['rev-parse', '--is-inside-work-tree'], cwd);

  const diffArgs = ['diff', '--name-only', '--relative', '-z'];
  if (since === undefined) {
    diffArgs.push('HEAD');
  } else {
    diffArgs.push(since);
  }
  diffArgs.push('--');

  let tracked = await git(diffArgs, cwd, since === undefined);
  if (since === undefined && tracked.length === 0) {
    tracked = await git(
      ['diff', '--name-only', '--relative', '-z', '--'],
      cwd,
      true,
    );
  }

  const untracked = await git(
    ['ls-files', '--others', '--exclude-standard', '-z'],
    cwd,
    true,
  );

  return [...splitNull(tracked), ...splitNull(untracked)].map((file) =>
    normalizeWatchPath(path.resolve(cwd, file)),
  );
}

export async function selectAffectedFiles(
  files: readonly string[],
  changed: readonly string[],
): Promise<string[]> {
  const graph = await collectDependencies(files);
  const affected = new Set(
    affectedTests(
      graph,
      new Set(changed.map((file) => normalizeWatchPath(file))),
    ),
  );

  return files.filter((file) => affected.has(normalizeWatchPath(file)));
}
