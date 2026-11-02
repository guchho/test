export type FakeTimerName =
  | 'Date'
  | 'setTimeout'
  | 'clearTimeout'
  | 'setInterval'
  | 'clearInterval'
  | 'setImmediate'
  | 'clearImmediate';

export interface FakeTimerInstallOptions {
  readonly now?: number | Date;
  readonly toFake?: readonly FakeTimerName[];
  readonly loopLimit?: number;
}

export interface FakeTimerApi {
  useFakeTimers(options?: FakeTimerInstallOptions): void;
  useRealTimers(): void;
  advanceTimersByTime(milliseconds: number): void;
  advanceTimersToNextTimer(): number;
  runAllTimers(): void;
  runOnlyPendingTimers(): void;
  setSystemTime(time: number | Date): void;
  getTimerCount(): number;
  clearAllTimers(): void;
  now(): number;
  isFakeTimers(): boolean;
}

type TimerCallback = (...args: unknown[]) => unknown;

interface ScheduledTimer {
  readonly id: number;
  readonly callback: TimerCallback;
  readonly args: readonly unknown[];
  readonly interval: number | undefined;
  due: number;
}

interface OriginalGlobals {
  readonly Date: DateConstructor;
  readonly setTimeout: typeof globalThis.setTimeout;
  readonly clearTimeout: typeof globalThis.clearTimeout;
  readonly setInterval: typeof globalThis.setInterval;
  readonly clearInterval: typeof globalThis.clearInterval;
  readonly setImmediate: typeof globalThis.setImmediate | undefined;
  readonly clearImmediate: typeof globalThis.clearImmediate | undefined;
}

const allTimerNames: readonly FakeTimerName[] = [
  'Date',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
];

const defaultLoopLimit = 100_000;

let active = false;
let currentNow = Date.now();
let nextId = 1;
let loopLimit = defaultLoopLimit;
let originals: OriginalGlobals | undefined;
const timers = new Map<number, ScheduledTimer>();

function toMilliseconds(time: number | Date): number {
  return time instanceof Date ? time.getTime() : time;
}

function assertFiniteTime(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number of milliseconds.`);
  }
}

function assertDelay(value: unknown, label: string): number {
  const delay = value === undefined ? 0 : Number(value);

  if (!Number.isFinite(delay) || delay < 0) {
    throw new TypeError(`${label} must be a non-negative finite number.`);
  }

  return delay;
}

function fakeDateConstructor(): DateConstructor {
  const FakeDate = function (this: unknown, ...args: unknown[]): Date | string {
    if (new.target === undefined) {
      return new originals!.Date(currentNow).toString();
    }

    if (args.length === 0) {
      return new originals!.Date(currentNow);
    }

    return new (
      originals!.Date as unknown as new (...values: unknown[]) => Date
    )(...args);
  } as unknown as DateConstructor;

  FakeDate.now = (): number => currentNow;
  FakeDate.parse = originals!.Date.parse;
  FakeDate.UTC = originals!.Date.UTC;
  (FakeDate as unknown as { prototype: Date }).prototype =
    originals!.Date.prototype;
  Object.defineProperty(FakeDate, 'name', { value: 'Date' });

  return FakeDate;
}

function schedule(
  callback: TimerCallback,
  delay: number,
  args: readonly unknown[],
  interval: number | undefined,
): number {
  const id = nextId;
  nextId += 1;
  timers.set(id, {
    id,
    callback,
    args,
    interval,
    due: currentNow + delay,
  });

  return id;
}

function findNextDue(limit: number): ScheduledTimer | undefined {
  let next: ScheduledTimer | undefined;

  for (const timer of timers.values()) {
    if (timer.due > limit) {
      continue;
    }

    if (
      next === undefined ||
      timer.due < next.due ||
      (timer.due === next.due && timer.id < next.id)
    ) {
      next = timer;
    }
  }

  return next;
}

function runUntil(limit: number): number {
  let fired = 0;

  for (;;) {
    const timer = findNextDue(limit);
    if (timer === undefined) {
      return fired;
    }

    currentNow = timer.due;

    if (timer.interval === undefined) {
      timers.delete(timer.id);
    } else {
      timer.due = currentNow + timer.interval;
    }

    fired += 1;
    if (fired > loopLimit) {
      throw new Error(
        `Fake timers exceeded the loop limit of ${loopLimit} while advancing timers.`,
      );
    }

    timer.callback(...timer.args);
  }
}

function clearTimer(id: unknown): void {
  if (typeof id === 'number') {
    timers.delete(id);
    return;
  }

  if (typeof id === 'object' && id !== null) {
    const numeric = Number(id);
    if (Number.isInteger(numeric)) {
      timers.delete(numeric);
    }
  }
}

function installTimerGlobals(names: ReadonlySet<FakeTimerName>): void {
  const global = globalThis as unknown as Record<string, unknown>;

  if (names.has('setTimeout')) {
    global.setTimeout = (
      callback: TimerCallback,
      delay?: unknown,
      ...args: unknown[]
    ): number =>
      schedule(
        callback,
        assertDelay(delay, 'setTimeout delay'),
        args,
        undefined,
      );
  }

  if (names.has('clearTimeout')) {
    global.clearTimeout = (id?: unknown): void => clearTimer(id);
  }

  if (names.has('setInterval')) {
    global.setInterval = (
      callback: TimerCallback,
      delay?: unknown,
      ...args: unknown[]
    ): number => {
      const milliseconds = assertDelay(delay, 'setInterval delay');
      return schedule(callback, milliseconds, args, milliseconds);
    };
  }

  if (names.has('clearInterval')) {
    global.clearInterval = (id?: unknown): void => clearTimer(id);
  }

  if (names.has('setImmediate')) {
    global.setImmediate = (
      callback: TimerCallback,
      ...args: unknown[]
    ): number => schedule(callback, 0, args, undefined);
  }

  if (names.has('clearImmediate')) {
    global.clearImmediate = (id?: unknown): void => clearTimer(id);
  }

  if (names.has('Date')) {
    global.Date = fakeDateConstructor();
  }
}

function restoreTimerGlobals(): void {
  if (originals === undefined) {
    return;
  }

  const global = globalThis as unknown as Record<string, unknown>;
  global.Date = originals.Date;
  global.setTimeout = originals.setTimeout;
  global.clearTimeout = originals.clearTimeout;
  global.setInterval = originals.setInterval;
  global.clearInterval = originals.clearInterval;

  if (originals.setImmediate !== undefined) {
    global.setImmediate = originals.setImmediate;
  }

  if (originals.clearImmediate !== undefined) {
    global.clearImmediate = originals.clearImmediate;
  }
}

function useFakeTimers(options: FakeTimerInstallOptions = {}): void {
  if (active) {
    useRealTimers();
  }

  const names = new Set(options.toFake ?? allTimerNames);
  loopLimit = options.loopLimit ?? defaultLoopLimit;

  if (!Number.isInteger(loopLimit) || loopLimit <= 0) {
    throw new TypeError('Fake timer loopLimit must be a positive integer.');
  }

  originals = {
    Date: globalThis.Date,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setImmediate: globalThis.setImmediate,
    clearImmediate: globalThis.clearImmediate,
  };

  currentNow =
    options.now === undefined ? Date.now() : toMilliseconds(options.now);
  assertFiniteTime(currentNow, 'Fake timer start time');
  nextId = 1;
  timers.clear();
  active = true;

  installTimerGlobals(names);
}

function useRealTimers(): void {
  if (!active) {
    return;
  }

  restoreTimerGlobals();
  timers.clear();
  active = false;
  originals = undefined;
}

function requireFakeTimers(): void {
  if (!active) {
    throw new Error(
      'Fake timers are not installed. Call mock.useFakeTimers() before advancing timers.',
    );
  }
}

function assertAdvance(milliseconds: unknown): number {
  if (
    typeof milliseconds !== 'number' ||
    !Number.isFinite(milliseconds) ||
    milliseconds < 0
  ) {
    throw new TypeError(
      'advanceTimersByTime expects a non-negative finite number of milliseconds.',
    );
  }

  return milliseconds;
}

function advanceTimersByTime(milliseconds: number): void {
  requireFakeTimers();
  const amount = assertAdvance(milliseconds);
  const target = currentNow + amount;

  runUntil(target);
  currentNow = target;
}

function advanceTimersToNextTimer(): number {
  requireFakeTimers();

  let next: ScheduledTimer | undefined;
  for (const timer of timers.values()) {
    if (
      next === undefined ||
      timer.due < next.due ||
      (timer.due === next.due && timer.id < next.id)
    ) {
      next = timer;
    }
  }

  if (next === undefined) {
    return 0;
  }

  const target = next.due;
  const advanced = target - currentNow;
  runUntil(target);
  currentNow = target;
  return advanced;
}

function runAllTimers(): void {
  requireFakeTimers();

  let fired = 0;
  for (;;) {
    const next = findNextDue(Number.POSITIVE_INFINITY);
    if (next === undefined) {
      return;
    }

    currentNow = next.due;
    if (next.interval === undefined) {
      timers.delete(next.id);
    } else {
      next.due = currentNow + next.interval;
    }

    fired += 1;
    if (fired > loopLimit) {
      throw new Error(
        `Fake timers exceeded the loop limit of ${loopLimit} while running timers.`,
      );
    }

    next.callback(...next.args);
  }
}

function runOnlyPendingTimers(): void {
  requireFakeTimers();

  let target = currentNow;
  for (const timer of timers.values()) {
    if (timer.due > target) {
      target = timer.due;
    }
  }

  runUntil(target);
  currentNow = target;
}

function setSystemTime(time: number | Date): void {
  if (!active) {
    throw new Error(
      'Fake timers are not installed. Call mock.useFakeTimers() before setting the system time.',
    );
  }

  const value = toMilliseconds(time);
  assertFiniteTime(value, 'System time');
  currentNow = value;
}

function getTimerCount(): number {
  if (!active) {
    return 0;
  }

  return timers.size;
}

function clearAllTimers(): void {
  timers.clear();
}

function now(): number {
  return active ? currentNow : Date.now();
}

function isFakeTimers(): boolean {
  return active;
}

export const fakeTimers: FakeTimerApi = {
  useFakeTimers,
  useRealTimers,
  advanceTimersByTime,
  advanceTimersToNextTimer,
  runAllTimers,
  runOnlyPendingTimers,
  setSystemTime,
  getTimerCount,
  clearAllTimers,
  now,
  isFakeTimers,
};
