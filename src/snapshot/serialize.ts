function quote(value: string): string {
  return JSON.stringify(value);
}

function constructorName(value: object): string | undefined {
  return (value as { constructor?: { name?: string } }).constructor?.name;
}

function unsupported(value: object): string {
  const name = constructorName(value);
  return name === undefined ? '[Object]' : `[${name}]`;
}

function renderArray(
  values: readonly unknown[],
  level: number,
  seen: WeakSet<object>,
): string {
  if (values.length === 0) {
    return '[]';
  }

  const indentation = '  '.repeat(level + 1);
  const closing = '  '.repeat(level);
  const lines = values.map(
    (value) => `${indentation}${render(value, level + 1, seen)},`,
  );

  return `[\n${lines.join('\n')}\n${closing}]`;
}

function renderRecord(
  label: string,
  entries: readonly (readonly [string, unknown])[],
  level: number,
  seen: WeakSet<object>,
): string {
  if (entries.length === 0) {
    return `${label}{}`;
  }

  const indentation = '  '.repeat(level + 1);
  const closing = '  '.repeat(level);
  const lines = entries.map(
    ([key, value]) =>
      `${indentation}${key}: ${render(value, level + 1, seen)},`,
  );

  return `${label}{\n${lines.join('\n')}\n${closing}}`;
}

function renderArrayLike(
  label: string,
  values: readonly unknown[],
  level: number,
  seen: WeakSet<object>,
): string {
  if (values.length === 0) {
    return `${label} []`;
  }

  return `${label} ${renderArray(values, level, seen)}`;
}

function render(
  value: unknown,
  level: number,
  seen: WeakSet<object>,
): string {
  switch (typeof value) {
    case 'string':
      return quote(value);
    case 'number':
      if (Object.is(value, -0)) {
        return '-0';
      }
      return String(value);
    case 'bigint':
      return `${value}n`;
    case 'boolean':
      return String(value);
    case 'undefined':
      return 'undefined';
    case 'symbol':
      return String(value);
    case 'function':
      return value.name.length > 0
        ? `[Function: ${value.name}]`
        : '[Function: anonymous]';
  }

  if (value === null) {
    return 'null';
  }

  const object = value as object;

  if (seen.has(object)) {
    return '[Circular]';
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? 'Date(Invalid Date)'
      : `Date(${value.toISOString()})`;
  }

  if (value instanceof RegExp) {
    return String(value);
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof Promise !== 'undefined' && value instanceof Promise) {
    return '[Promise]';
  }

  seen.add(object);

  try {
    if (Array.isArray(value)) {
      return renderArray(value, level, seen);
    }

    if (value instanceof Map) {
      const entries = [...value.entries()]
        .map(([key, entry]) => {
          const renderedKey = render(key, level + 1, seen);
          return {
            sortKey: renderedKey,
            line: `${renderedKey} => ${render(entry, level + 1, seen)}`,
          };
        })
        .sort((left, right) =>
          left.sortKey < right.sortKey
            ? -1
            : left.sortKey > right.sortKey
              ? 1
              : 0,
        )
        .map((entry) => entry.line);

      if (entries.length === 0) {
        return 'Map {}';
      }

      const indentation = '  '.repeat(level + 1);
      const closing = '  '.repeat(level);
      return `Map {\n${entries.map((line) => `${indentation}${line},`).join('\n')}\n${closing}}`;
    }

    if (value instanceof Set) {
      const entries = [...value].map(
        (entry) => render(entry, level + 1, seen),
      );

      if (entries.length === 0) {
        return 'Set {}';
      }

      const indentation = '  '.repeat(level + 1);
      const closing = '  '.repeat(level);
      return `Set {\n${entries.map((line) => `${indentation}${line},`).join('\n')}\n${closing}}`;
    }

    if (ArrayBuffer.isView(value)) {
      if (value instanceof DataView) {
        return `DataView { byteLength: ${value.byteLength} }`;
      }

      const typed = value as unknown as {
        readonly constructor: { readonly name: string };
        readonly length: number;
        readonly [index: number]: unknown;
      };
      const name =
        typeof Buffer !== 'undefined' && Buffer.isBuffer(value)
          ? 'Buffer'
          : typed.constructor.name;
      return renderArrayLike(
        name,
        Array.from({ length: typed.length }, (_, index) => typed[index]),
        level,
        seen,
      );
    }

    if (value instanceof ArrayBuffer) {
      return `ArrayBuffer { byteLength: ${value.byteLength} }`;
    }

    if (
      value instanceof WeakMap ||
      value instanceof WeakSet ||
      value instanceof WeakRef
    ) {
      return unsupported(value);
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    const isPlain =
      prototype === Object.prototype || prototype === null;

    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map(
        (key): readonly [string, unknown] => [
          /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quote(key),
          record[key],
        ],
      );

    if (!isPlain) {
      const name = constructorName(value as object) ?? 'Object';
      return renderRecord(`${name} `, entries, level, seen);
    }

    return renderRecord('', entries, level, seen);
  } finally {
    seen.delete(object);
  }
}

export function serializeSnapshot(value: unknown): string {
  return render(value, 0, new WeakSet<object>());
}
