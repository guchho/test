import { formatValue } from '../expect/format.js';

export type EachCase = readonly unknown[] | Record<string, unknown>;

const placeholderPattern = /%([sdifjo#%])/g;
const dollarPlaceholderPattern = /\$([A-Za-z_][A-Za-z0-9_]*|\{[^}]+\})/g;

export function isEachCaseObject(
  entry: unknown,
): entry is Record<string, unknown> {
  if (Array.isArray(entry) || entry === null || typeof entry !== 'object') {
    return false;
  }
  return true;
}

export function assertEachCases(
  cases: unknown,
): asserts cases is readonly EachCase[] {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new TypeError('each expects a non-empty array of cases.');
  }

  for (const entry of cases) {
    if (Array.isArray(entry)) {
      continue;
    }
    if (isEachCaseObject(entry)) {
      continue;
    }
    throw new TypeError('each expects every case to be an array of values.');
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

function formatValueForTitle(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function getObjectProperty(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (let i = 0; i < keys.length; i += 1) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    const key = keys[i] as string;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function formatEachTitle(
  template: string,
  argsOrObject: readonly unknown[] | Record<string, unknown>,
  index: number,
): string {
  if (typeof template !== 'string' || template.length === 0) {
    throw new TypeError('each expects a non-empty test name.');
  }

  if (isEachCaseObject(argsOrObject)) {
    let result = template.replace(dollarPlaceholderPattern, (_match, key: string) => {
      const propKey = key.startsWith('{') && key.endsWith('}')
        ? key.slice(1, -1)
        : key;
      const obj = argsOrObject as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(obj, propKey)) {
        const val = obj[propKey];
        if (val === undefined && propKey.includes('.')) {
          const value = getObjectProperty(obj, propKey);
          return formatValueForTitle(value);
        }
        if (val === undefined && !propKey.includes('.')) {
          return formatValueForTitle(val);
        }
        return formatValueForTitle(val);
      }
      const value = getObjectProperty(obj, propKey);
      if (value === undefined && !propKey.includes('.')) {
        throw new TypeError(
          `The each title "${template}" uses a property that is not provided.`,
        );
      }
      return formatValueForTitle(value);
    });
    result = result.replace(/%#/g, String(index));
    return result;
  }

  const args = argsOrObject;
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
