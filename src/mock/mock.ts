import { mockModule } from './module.js';

export interface MockResult {
  readonly type: 'return' | 'throw';
  readonly value: unknown;
}

export interface MockState {
  readonly calls: readonly unknown[][];
  readonly results: readonly MockResult[];
  readonly instances: readonly unknown[];
  readonly invocationCallOrder: readonly number[];
  readonly lastCall: readonly unknown[] | undefined;
  clear(): void;
  reset(): void;
  restore(): void;
}

export interface MockFunction<
  TArgs extends unknown[] = unknown[],
  TReturn = unknown,
> {
  (...args: TArgs): TReturn;
  readonly mock: MockState;
  mockClear(): MockFunction<TArgs, TReturn>;
  mockReset(): MockFunction<TArgs, TReturn>;
  mockRestore(): MockFunction<TArgs, TReturn>;
  mockImplementation(
    implementation: (...args: TArgs) => TReturn,
  ): MockFunction<TArgs, TReturn>;
  mockImplementationOnce(
    implementation: (...args: TArgs) => TReturn,
  ): MockFunction<TArgs, TReturn>;
  mockReturnValue(value: TReturn): MockFunction<TArgs, TReturn>;
  mockReturnValueOnce(value: TReturn): MockFunction<TArgs, TReturn>;
  mockResolvedValue(value: Awaited<TReturn>): MockFunction<TArgs, TReturn>;
  mockResolvedValueOnce(
    value: Awaited<TReturn>,
  ): MockFunction<TArgs, TReturn>;
  mockRejectedValue(reason: unknown): MockFunction<TArgs, TReturn>;
  mockRejectedValueOnce(reason: unknown): MockFunction<TArgs, TReturn>;
}

export interface MockApi {
  fn<TArgs extends unknown[] = unknown[], TReturn = unknown>(
    implementation?: (...args: TArgs) => TReturn,
  ): MockFunction<TArgs, TReturn>;
  spyOn<T extends object, K extends keyof T>(
    object: T,
    key: K,
  ): MockFunction<SpyArgs<T[K]>, SpyReturn<T[K]>>;
  clearAll(): void;
  resetAll(): void;
  restoreAll(): void;
  module(specifier: string, factory: () => Record<string, unknown>): void;
}

type SpyArgs<T> = T extends (...args: infer A) => unknown ? A : unknown[];
type SpyReturn<T> = T extends (...args: never[]) => infer R ? R : unknown;

type AnyImplementation = (this: unknown, ...args: unknown[]) => unknown;

interface MockInternal {
  implementation: AnyImplementation | undefined;
  initialImplementation: AnyImplementation | undefined;
  readonly once: AnyImplementation[];
  readonly calls: unknown[][];
  readonly results: MockResult[];
  readonly instances: unknown[];
  readonly invocationCallOrder: number[];
  readonly original: AnyImplementation | undefined;
  restore: (() => void) | undefined;
}

const internals = new WeakMap<object, MockInternal>();
const registered = new Set<object>();
let invocationCounter = 0;

function isObjectLike(value: unknown): value is object {
  return (
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
  );
}

function createMock<TArgs extends unknown[], TReturn>(
  implementation: ((...args: TArgs) => TReturn) | undefined,
  original: AnyImplementation | undefined,
  restore: (() => void) | undefined,
): MockFunction<TArgs, TReturn> {
  const internal: MockInternal = {
    implementation: implementation as AnyImplementation | undefined,
    initialImplementation: implementation as AnyImplementation | undefined,
    once: [],
    calls: [],
    results: [],
    instances: [],
    invocationCallOrder: [],
    original,
    restore,
  };

  const mockFunction = function (
    this: unknown,
    ...args: unknown[]
  ): unknown {
    const constructing = new.target !== undefined;

    internal.calls.push(args);
    internal.invocationCallOrder.push((invocationCounter += 1));

    const next = internal.once.shift();
    const implementationToUse = next ?? internal.implementation;

    let value: unknown;

    try {
      if (implementationToUse === undefined) {
        value = undefined;
      } else if (
        constructing &&
        implementationToUse === internal.original &&
        internal.original !== undefined
      ) {
        value = Reflect.construct(
          internal.original,
          args,
          new.target as Function,
        );
      } else if (constructing) {
        const produced = implementationToUse.apply(this, args);
        value = isObjectLike(produced) ? produced : this;
      } else {
        value = implementationToUse.apply(this, args);
      }
    } catch (error) {
      internal.results.push({ type: 'throw', value: error });
      throw error;
    }

    if (constructing) {
      internal.instances.push(isObjectLike(value) ? value : this);
    }

    internal.results.push({ type: 'return', value });
    return value;
  };

  internals.set(mockFunction, internal);

  const mockState: MockState = {
    get calls(): readonly unknown[][] {
      return internal.calls;
    },
    get results(): readonly MockResult[] {
      return internal.results;
    },
    get instances(): readonly unknown[] {
      return internal.instances;
    },
    get invocationCallOrder(): readonly number[] {
      return internal.invocationCallOrder;
    },
    get lastCall(): readonly unknown[] | undefined {
      return internal.calls.length === 0
        ? undefined
        : internal.calls[internal.calls.length - 1];
    },
    clear: (): void => {
      clearInternal(internal);
    },
    reset: (): void => {
      resetInternal(internal);
    },
    restore: (): void => {
      restoreInternal(internal);
    },
  };

  Object.defineProperties(mockFunction, {
    mock: { value: mockState, enumerable: true },
    mockClear: {
      value: (): MockFunction<TArgs, TReturn> => {
        clearInternal(internal);
        return mockFunctionTyped;
      },
    },
    mockReset: {
      value: (): MockFunction<TArgs, TReturn> => {
        resetInternal(internal);
        return mockFunctionTyped;
      },
    },
    mockRestore: {
      value: (): MockFunction<TArgs, TReturn> => {
        restoreInternal(internal);
        return mockFunctionTyped;
      },
    },
    mockImplementation: {
      value: (
        next: (...args: TArgs) => TReturn,
      ): MockFunction<TArgs, TReturn> => {
        internal.implementation = next as AnyImplementation;
        return mockFunctionTyped;
      },
    },
    mockImplementationOnce: {
      value: (
        next: (...args: TArgs) => TReturn,
      ): MockFunction<TArgs, TReturn> => {
        internal.once.push(next as AnyImplementation);
        return mockFunctionTyped;
      },
    },
    mockReturnValue: {
      value: (value: TReturn): MockFunction<TArgs, TReturn> => {
        internal.implementation = (): unknown => value;
        return mockFunctionTyped;
      },
    },
    mockReturnValueOnce: {
      value: (value: TReturn): MockFunction<TArgs, TReturn> => {
        internal.once.push((): unknown => value);
        return mockFunctionTyped;
      },
    },
    mockResolvedValue: {
      value: (value: Awaited<TReturn>): MockFunction<TArgs, TReturn> => {
        internal.implementation = async (): Promise<unknown> => value;
        return mockFunctionTyped;
      },
    },
    mockResolvedValueOnce: {
      value: (value: Awaited<TReturn>): MockFunction<TArgs, TReturn> => {
        internal.once.push(async (): Promise<unknown> => value);
        return mockFunctionTyped;
      },
    },
    mockRejectedValue: {
      value: (reason: unknown): MockFunction<TArgs, TReturn> => {
        internal.implementation = async (): Promise<unknown> => {
          throw reason;
        };
        return mockFunctionTyped;
      },
    },
    mockRejectedValueOnce: {
      value: (reason: unknown): MockFunction<TArgs, TReturn> => {
        internal.once.push(async (): Promise<unknown> => {
          throw reason;
        });
        return mockFunctionTyped;
      },
    },
  });

  const mockFunctionTyped = mockFunction as unknown as MockFunction<
    TArgs,
    TReturn
  >;

  if (restore !== undefined) {
    const originalPrototype = (
      original as { prototype?: unknown } | undefined
    )?.prototype;
    if (originalPrototype !== undefined) {
      (mockFunction as { prototype?: unknown }).prototype = originalPrototype;
    }
  }

  registered.add(mockFunctionTyped);
  return mockFunctionTyped;
}

function clearInternal(internal: MockInternal): void {
  internal.calls.length = 0;
  internal.results.length = 0;
  internal.instances.length = 0;
  internal.invocationCallOrder.length = 0;
}

function resetInternal(internal: MockInternal): void {
  clearInternal(internal);
  internal.once.length = 0;
  internal.implementation = internal.initialImplementation;
}

function restoreInternal(internal: MockInternal): void {
  if (internal.restore !== undefined) {
    internal.restore();
    internal.restore = undefined;
  }

  resetInternal(internal);
}

export function fn<TArgs extends unknown[] = unknown[], TReturn = unknown>(
  implementation?: (...args: TArgs) => TReturn,
): MockFunction<TArgs, TReturn> {
  return createMock(implementation, undefined, undefined);
}

function findDescriptor(
  object: object,
  key: PropertyKey,
): { owner: object; descriptor: PropertyDescriptor } | undefined {
  let owner: object | null = object;

  while (owner !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor !== undefined) {
      return { owner, descriptor };
    }

    owner = Object.getPrototypeOf(owner) as object | null;
  }

  return undefined;
}

export function spyOn<T extends object, K extends keyof T>(
  object: T,
  key: K,
): MockFunction<SpyArgs<T[K]>, SpyReturn<T[K]>> {
  if (object === null || typeof object !== 'object') {
    throw new TypeError('mock.spyOn expects an object.');
  }

  const found = findDescriptor(object, key);
  if (found === undefined) {
    throw new TypeError(
      `Cannot spy on property "${String(key)}": the property does not exist.`,
    );
  }

  const { descriptor } = found;

  if (!descriptor.configurable) {
    throw new TypeError(
      `Cannot spy on property "${String(key)}": the property is not configurable.`,
    );
  }

  if (
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    typeof descriptor.value !== 'function'
  ) {
    throw new TypeError(
      `Cannot spy on property "${String(key)}": only configurable function properties are supported.`,
    );
  }

  const original = descriptor.value as AnyImplementation;
  const ownDescriptor = Object.getOwnPropertyDescriptor(object, key);

  const spy = createMock<SpyArgs<T[K]>, SpyReturn<T[K]>>(
    original as (...args: SpyArgs<T[K]>) => SpyReturn<T[K]>,
    original,
    (): void => {
      if (ownDescriptor !== undefined) {
        Object.defineProperty(object, key, ownDescriptor);
      } else {
        delete (object as Record<PropertyKey, unknown>)[key];
      }
    },
  );

  try {
    Object.defineProperty(object, key, {
      value: spy,
      writable: descriptor.writable ?? true,
      enumerable: descriptor.enumerable ?? true,
      configurable: true,
    });
  } catch (error) {
    throw new TypeError(
      `Cannot spy on property "${String(key)}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return spy;
}

export function isMockFunction(value: unknown): value is MockFunction {
  return isObjectLike(value) && internals.has(value);
}

export const mock: MockApi = {
  fn,
  spyOn,
  clearAll(): void {
    for (const mockFunction of registered) {
      const internal = internals.get(mockFunction);
      if (internal !== undefined) {
        clearInternal(internal);
      }
    }
  },
  resetAll(): void {
    for (const mockFunction of registered) {
      const internal = internals.get(mockFunction);
      if (internal !== undefined) {
        resetInternal(internal);
      }
    }
  },
  restoreAll(): void {
    for (const mockFunction of registered) {
      const internal = internals.get(mockFunction);
      if (internal !== undefined) {
        restoreInternal(internal);
      }
    }
  },
  module(specifier: string, factory: () => Record<string, unknown>): void {
    mockModule(specifier, factory);
  },
};
