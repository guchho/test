import { inspect } from 'node:util';

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  return `Thrown value: ${inspect(error)}`;
}
