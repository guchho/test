import { inspect } from 'node:util';

export function formatValue(value: unknown): string {
  return inspect(value, {
    depth: 6,
    breakLength: 80,
    compact: false,
    colors: false,
    maxArrayLength: 50,
    maxStringLength: 5000,
  });
}
