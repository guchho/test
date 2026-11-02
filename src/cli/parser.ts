import type { ReporterName } from '../config/types.js';
import type { ExecutionPool } from '../runner/types.js';

export interface ShardOptions {
  readonly index: number;
  readonly count: number;
}

export interface RunCommand {
  readonly kind: 'run';
  readonly files: string[];
  readonly filter: string | undefined;
  readonly testNamePattern: string | undefined;
  readonly config: string | undefined;
  readonly timeout: number | undefined;
  readonly reporter: ReporterName | undefined;
  readonly maxWorkers: number | undefined;
  readonly pool: ExecutionPool | undefined;
  readonly shard: ShardOptions | undefined;
  readonly bail: boolean;
  readonly updateSnapshots: boolean;
  readonly coverage: boolean;
  readonly silent: boolean;
  readonly listTests: boolean;
  readonly passWithNoTests: boolean;
  readonly changed: boolean;
  readonly changedSince: string | undefined;
  readonly related: readonly string[];
  readonly watch: boolean;
}

export type ParsedCommand =
  RunCommand | { readonly kind: 'help' } | { readonly kind: 'version' };

export class CliError extends Error {
  override readonly name = 'CliError';
}

const reporterNames = new Set<ReporterName>([
  'default',
  'verbose',
  'dot',
  'json',
  'junit',
  'tap',
  'github',
  'github-actions',
]);

const poolNames = new Set<ExecutionPool>(['threads', 'forks']);

function readValue(
  argv: readonly string[],
  index: number,
  option: string,
): string {
  const value = argv[index];

  if (value === undefined || value.length === 0) {
    throw new CliError(`The ${option} option requires a value.`);
  }

  return value;
}

function readTimeoutValue(argv: readonly string[], index: number): number {
  const timeout = Number(readValue(argv, index, '--timeout'));
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new CliError('The --timeout option requires a positive number.');
  }

  return timeout;
}

function readMaxWorkersValue(argv: readonly string[], index: number): number {
  const value = readValue(argv, index, '--maxWorkers');
  const maxWorkers = Number(value);

  if (!Number.isInteger(maxWorkers) || maxWorkers <= 0) {
    throw new CliError('The --maxWorkers option requires a positive integer.');
  }

  return maxWorkers;
}

function readReporterValue(
  argv: readonly string[],
  index: number,
): ReporterName {
  const value = readValue(argv, index, '--reporter');

  if (!reporterNames.has(value as ReporterName)) {
    throw new CliError(`Unknown reporter: ${value}`);
  }

  return value as ReporterName;
}

function readShardValue(argv: readonly string[], index: number): ShardOptions {
  const value = readValue(argv, index, '--shard');
  const match = /^(\d+)\/(\d+)$/.exec(value);

  if (match === null) {
    throw new CliError(
      'The --shard option requires a value in the form <index>/<count>.',
    );
  }

  const shardIndex = Number(match[1]);
  const shardCount = Number(match[2]);

  if (
    !Number.isSafeInteger(shardIndex) ||
    !Number.isSafeInteger(shardCount) ||
    shardIndex < 1 ||
    shardCount < 1 ||
    shardIndex > shardCount
  ) {
    throw new CliError('The --shard option requires 1 <= index <= count.');
  }

  return { index: shardIndex, count: shardCount };
}

function readPoolValue(argv: readonly string[], index: number): ExecutionPool {
  const value = readValue(argv, index, '--pool');

  if (!poolNames.has(value as ExecutionPool)) {
    throw new CliError(
      `Unknown pool: ${value}. Supported pools are "threads" and "forks".`,
    );
  }

  return value as ExecutionPool;
}

export function parseArgs(argv: readonly string[]): ParsedCommand {
  const files: string[] = [];
  let filter: string | undefined;
  let testNamePattern: string | undefined;
  let config: string | undefined;
  let timeout: number | undefined;
  let reporter: ReporterName | undefined;
  let maxWorkers: number | undefined;
  let pool: ExecutionPool | undefined;
  let shard: ShardOptions | undefined;
  let bail = false;
  let updateSnapshots = false;
  let coverage = false;
  let silent = false;
  let listTests = false;
  let passWithNoTests = false;
  let changed = false;
  let changedSince: string | undefined;
  const related: string[] = [];
  let watch = false;
  let command: 'run' | 'watch' | undefined;

  const selectCommand = (next: 'run' | 'watch'): void => {
    if (command !== undefined && command !== next) {
      throw new CliError('Only one command may be provided.');
    }

    command = next;
    watch = next === 'watch';
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === undefined) {
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      return { kind: 'help' };
    }

    if (argument === '--version' || argument === '-v') {
      return { kind: 'version' };
    }

    if (argument === 'run') {
      selectCommand('run');
      continue;
    }

    if (argument === 'watch' || argument === '--watch') {
      selectCommand('watch');
      continue;
    }

    if (argument === '--run') {
      selectCommand('run');
      continue;
    }

    if (argument === '--bail') {
      bail = true;
      continue;
    }

    if (argument === '--update' || argument === '-u') {
      updateSnapshots = true;
      continue;
    }

    if (argument === '--coverage') {
      coverage = true;
      continue;
    }

    if (argument === '--silent') {
      silent = true;
      continue;
    }

    if (argument === '--listTests') {
      listTests = true;
      continue;
    }

    if (argument === '--passWithNoTests') {
      passWithNoTests = true;
      continue;
    }

    if (argument === '--changed') {
      changed = true;
      continue;
    }

    if (argument.startsWith('--changed=')) {
      changed = true;
      changedSince = readValue(
        [argument.slice('--changed='.length)],
        0,
        '--changed',
      );
      continue;
    }

    if (argument === '--related') {
      index += 1;
      related.push(readValue(argv, index, '--related'));
      continue;
    }

    if (argument.startsWith('--related=')) {
      related.push(
        readValue([argument.slice('--related='.length)], 0, '--related'),
      );
      continue;
    }

    if (argument === '--filter') {
      index += 1;
      filter = readValue(argv, index, '--filter');
      continue;
    }

    if (argument.startsWith('--filter=')) {
      filter = readValue([argument.slice('--filter='.length)], 0, '--filter');
      continue;
    }

    if (argument === '--testNamePattern') {
      index += 1;
      testNamePattern = readValue(argv, index, '--testNamePattern');
      continue;
    }

    if (argument.startsWith('--testNamePattern=')) {
      testNamePattern = readValue(
        [argument.slice('--testNamePattern='.length)],
        0,
        '--testNamePattern',
      );
      continue;
    }

    if (argument === '--config') {
      index += 1;
      config = readValue(argv, index, '--config');
      continue;
    }

    if (argument.startsWith('--config=')) {
      config = readValue([argument.slice('--config='.length)], 0, '--config');
      continue;
    }

    if (argument === '--timeout') {
      index += 1;
      timeout = readTimeoutValue(argv, index);
      continue;
    }

    if (argument.startsWith('--timeout=')) {
      timeout = readTimeoutValue([argument.slice('--timeout='.length)], 0);
      continue;
    }

    if (argument === '--reporter') {
      index += 1;
      reporter = readReporterValue(argv, index);
      continue;
    }

    if (argument.startsWith('--reporter=')) {
      reporter = readReporterValue([argument.slice('--reporter='.length)], 0);
      continue;
    }

    if (argument === '--maxWorkers') {
      index += 1;
      maxWorkers = readMaxWorkersValue(argv, index);
      continue;
    }

    if (argument.startsWith('--maxWorkers=')) {
      maxWorkers = readMaxWorkersValue(
        [argument.slice('--maxWorkers='.length)],
        0,
      );
      continue;
    }

    if (argument === '--pool') {
      index += 1;
      pool = readPoolValue(argv, index);
      continue;
    }

    if (argument.startsWith('--pool=')) {
      pool = readPoolValue([argument.slice('--pool='.length)], 0);
      continue;
    }

    if (argument === '--shard') {
      index += 1;
      shard = readShardValue(argv, index);
      continue;
    }

    if (argument.startsWith('--shard=')) {
      shard = readShardValue([argument.slice('--shard='.length)], 0);
      continue;
    }

    if (argument === '--') {
      files.push(...argv.slice(index + 1));
      break;
    }

    if (argument.startsWith('-')) {
      throw new CliError(`Unknown option: ${argument}`);
    }

    files.push(argument);
  }

  if (watch && shard !== undefined) {
    throw new CliError('The --shard option cannot be used with watch mode.');
  }

  if (watch && listTests) {
    throw new CliError(
      'The --listTests option cannot be used with watch mode.',
    );
  }

  if (watch && (changed || related.length > 0)) {
    throw new CliError(
      'The --changed and --related options cannot be used with watch mode.',
    );
  }

  return {
    kind: 'run',
    files,
    filter,
    testNamePattern,
    config,
    timeout,
    reporter,
    maxWorkers,
    pool,
    shard,
    bail,
    updateSnapshots,
    coverage,
    silent,
    listTests,
    passWithNoTests,
    changed,
    changedSince,
    related,
    watch,
  };
}
