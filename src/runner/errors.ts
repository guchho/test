import { inspect } from 'node:util';

import { InspectedValue } from './serialize.js';

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  if (error instanceof InspectedValue) {
    return `Thrown value: ${error.inspected}`;
  }

  return `Thrown value: ${inspect(error)}`;
}
