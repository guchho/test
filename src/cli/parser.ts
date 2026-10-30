export type ParsedCommand =
  | { readonly kind: 'run'; readonly files: string[]; readonly filter: string | undefined }
  | { readonly kind: 'help' }
  | { readonly kind: 'version' };

export class CliError extends Error {
  override readonly name = 'CliError';
}

function readFilterValue(argv: readonly string[], index: number): string {
  const value = argv[index];

  if (value === undefined || value.length === 0) {
    throw new CliError('The --filter option requires a value.');
  }

  return value;
}

export function parseArgs(argv: readonly string[]): ParsedCommand {
  const files: string[] = [];
  let filter: string | undefined;
  let commandSeen = false;

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

    if (argument === 'run' || argument === '--run') {
      if (commandSeen) {
        throw new CliError('Only one command may be provided.');
      }

      commandSeen = true;
      continue;
    }

    if (argument === 'watch') {
      throw new CliError('Watch mode is not available in this version.');
    }

    if (argument === '--filter') {
      index += 1;
      filter = readFilterValue(argv, index);
      continue;
    }

    if (argument.startsWith('--filter=')) {
      filter = readFilterValue([argument.slice('--filter='.length)], 0);
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

  return { kind: 'run', files, filter };
}
