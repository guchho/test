import type { EnvironmentName } from '../config/types.js';

export interface InstalledEnvironment {
  readonly name: EnvironmentName;
  teardown(): void;
}

interface GlobalRestore {
  readonly key: string;
  readonly descriptor: PropertyDescriptor | undefined;
}

const domSkipKeys = new Set([
  'globalThis',
  'window',
  'self',
  'top',
  'parent',
  'frames',
]);

function copyGlobals(
  source: Record<string, unknown>,
  restore: GlobalRestore[],
): void {
  const target = globalThis as unknown as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    if (domSkipKeys.has(key)) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor === undefined) {
      continue;
    }

    restore.push({
      key,
      descriptor: Object.getOwnPropertyDescriptor(target, key),
    });

    try {
      Object.defineProperty(target, key, {
        ...descriptor,
        configurable: true,
      });
    } catch {
      // Some host objects are not redefinable; keep the Node.js global.
    }
  }
}

function restoreGlobals(restore: readonly GlobalRestore[]): void {
  const target = globalThis as unknown as Record<string, unknown>;

  for (let index = restore.length - 1; index >= 0; index -= 1) {
    const entry = restore[index];
    if (entry === undefined) {
      continue;
    }

    try {
      if (entry.descriptor === undefined) {
        delete target[entry.key];
      } else {
        Object.defineProperty(target, entry.key, entry.descriptor);
      }
    } catch {
      // Ignore globals that cannot be restored.
    }
  }
}

function domUnavailable(name: EnvironmentName, error: unknown): Error {
  return new Error(
    [
      `The "${name}" test environment is not available.`,
      `Install it with: npm install --save-dev ${name}`,
      error instanceof Error ? error.message : String(error),
    ].join('\n'),
  );
}

function applyDom(window: Record<string, unknown>): InstalledEnvironment {
  const restore: GlobalRestore[] = [];

  copyGlobals(window, restore);

  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of ['window', 'document', 'navigator'] as const) {
    const value = key === 'window' ? window : window[key];
    if (value === undefined) {
      continue;
    }

    restore.push({
      key,
      descriptor: Object.getOwnPropertyDescriptor(target, key),
    });
    Object.defineProperty(target, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  return {
    name: 'jsdom',
    teardown(): void {
      restoreGlobals(restore);
    },
  };
}

export async function installEnvironment(
  name: EnvironmentName,
  options: Readonly<Record<string, unknown>> = {},
): Promise<InstalledEnvironment> {
  if (name !== 'node' && name !== 'jsdom' && name !== 'happy-dom') {
    throw new Error(`Unknown test environment "${String(name)}".`);
  }

  if (name === 'node') {
    return {
      name,
      teardown(): void {},
    };
  }

  const dynamicImport = (specifier: string): Promise<unknown> =>
    import(specifier);

  if (name === 'jsdom') {
    let module: unknown;

    try {
      module = await dynamicImport('jsdom');
    } catch (error) {
      throw domUnavailable(name, error);
    }

    const JSDOM = (
      module as {
        JSDOM?: new (
          html?: string,
          options?: unknown,
        ) => { window: Record<string, unknown> };
      }
    ).JSDOM;
    if (typeof JSDOM !== 'function') {
      throw new Error('The "jsdom" package does not export JSDOM.');
    }

    const dom = new JSDOM('<!doctype html><html><body></body></html>', options);
    const installed = applyDom(dom.window);
    return { ...installed, name };
  }

  let module: unknown;

  try {
    module = await dynamicImport('happy-dom');
  } catch (error) {
    throw domUnavailable(name, error);
  }

  const Window = (
    module as { Window?: new (options?: unknown) => Record<string, unknown> }
  ).Window;
  if (typeof Window !== 'function') {
    throw new Error('The "happy-dom" package does not export Window.');
  }

  const window = new Window(options);
  const installed = applyDom(window);
  return { ...installed, name };
}
