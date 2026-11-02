import { expect } from '../expect/expect.js';
import { mock } from '../mock/mock.js';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  fails,
  it,
  skip,
  suite,
  test,
  todo,
} from './registry.js';

interface InstalledGlobal {
  readonly key: string;
  readonly descriptor: PropertyDescriptor | undefined;
}

let installed: InstalledGlobal[] | undefined;

function createJestGlobal(): Record<string, unknown> {
  return {
    ...mock,
    expect,
    mock,
    fn: mock.fn,
    spyOn: mock.spyOn,
    clearAllMocks: mock.clearAll,
    resetAllMocks: mock.resetAll,
    restoreAllMocks: mock.restoreAll,
  };
}

function globalValues(): Record<string, unknown> {
  const jest = createJestGlobal();

  return {
    describe,
    suite,
    it,
    test,
    expect,
    mock,
    jest,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    skip,
    todo,
    fails,
    xdescribe: describe.skip,
    xit: it.skip,
    xtest: it.skip,
    fdescribe: describe.only,
    fit: it.only,
  };
}

export function installGlobals(): void {
  if (installed !== undefined) {
    return;
  }

  const target = globalThis as unknown as Record<string, unknown>;
  const entries: InstalledGlobal[] = [];

  for (const [key, value] of Object.entries(globalValues())) {
    entries.push({
      key,
      descriptor: Object.getOwnPropertyDescriptor(target, key),
    });

    Object.defineProperty(target, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  installed = entries;
}

export function removeGlobals(): void {
  if (installed === undefined) {
    return;
  }

  const target = globalThis as unknown as Record<string, unknown>;

  for (let index = installed.length - 1; index >= 0; index -= 1) {
    const entry = installed[index];
    if (entry === undefined) {
      continue;
    }

    if (entry.descriptor === undefined) {
      delete target[entry.key];
    } else {
      Object.defineProperty(target, entry.key, entry.descriptor);
    }
  }

  installed = undefined;
}
