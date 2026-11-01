import { formatValue } from '../expect/format.js';

export type EachCase = readonly unknown[];

const placeholderPattern = /%([sdifjo#%])/g;

export function assertEachCases(
  cases: unknown,
): asserts cases is readonly EachCase[] {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new TypeError('each expects a non-empty array of cases.');
  }

  for (const entry of cases) {
    if (!Array.isArray(entry)) {
      throw new TypeError('each expects every case to be an array of values.');
    }
  }
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function formatPlaceholder(token: string, value: unknown): string {
  switch (token) {
    case 's':
      return String(value);
    case 'd':
    case 'i':
      return typeof value === 'number' ? String(Math.trunc(value)) : String(value);
    case 'f':
      return String(value);
    case 'j':
      return formatJson(value);
    case 'o':
      return formatValue(value);
    default:
      return String(value);
  }
}

export function formatEachTitle(
  template: string,
  args: readonly unknown[],
  index: number,
): string {
  if (typeof template !== 'string' || template.length === 0) {
    throw new TypeError('each expects a non-empty test name.');
  }

  let argumentIndex = 0;

  return template.replace(placeholderPattern, (_match, token: string) => {
    if (token === '%') {
      return '%';
    }

    if (token === '#') {
      return String(index);
    }

    if (argumentIndex >= args.length) {
      throw new TypeError(
        `The each title "${template}" uses more placeholders than the case provides.`,
      );
    }

    const value = args[argumentIndex];
    argumentIndex += 1;
    return formatPlaceholder(token, value);
  });
}
