import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SnapshotSessionOptions {
  readonly testFile: string;
  readonly update: boolean;
}

interface SnapshotState {
  testFile: string | undefined;
  update: boolean;
  currentTest: string | undefined;
  counters: Map<string, number>;
  usedKeys: Set<string>;
  values: Map<string, string> | undefined;
}

const state: SnapshotState = {
  testFile: undefined,
  update: false,
  currentTest: undefined,
  counters: new Map<string, number>(),
  usedKeys: new Set<string>(),
  values: undefined,
};

export function configureSnapshots(options: SnapshotSessionOptions): void {
  state.testFile = options.testFile;
  state.update = options.update;
  state.currentTest = undefined;
  state.counters.clear();
  state.usedKeys.clear();
  state.values = undefined;
}

export function resetSnapshots(): void {
  configureSnapshots({ testFile: '<unknown>', update: false });
}

export function beginSnapshotTest(fullName: string): void {
  state.currentTest = fullName;
  state.counters.clear();
  state.usedKeys.clear();
}

export function endSnapshotTest(): void {
  state.currentTest = undefined;
  state.counters.clear();
  state.usedKeys.clear();
}

export function snapshotsAreUpdating(): boolean {
  return state.update;
}

export function snapshotTestFile(): string {
  if (state.testFile === undefined) {
    throw new Error('Snapshots are not configured for this test session.');
  }

  return state.testFile;
}

export function snapshotFilePath(): string {
  const testFile = snapshotTestFile();

  return path.join(
    path.dirname(testFile),
    '__snapshots__',
    `${path.basename(testFile)}.snap`,
  );
}

export function nextSnapshotKey(hint: string | undefined): string {
  const base = state.currentTest ?? '<global>';
  const count = (state.counters.get(base) ?? 0) + 1;
  state.counters.set(base, count);

  let key =
    hint === undefined || hint.length === 0
      ? `${base} ${count}`
      : `${base}: ${hint}`;

  if (state.usedKeys.has(key)) {
    key = `${key} ${count}`;
  }

  state.usedKeys.add(key);
  return key;
}

function loadValues(): Map<string, string> {
  if (state.values !== undefined) {
    return state.values;
  }

  const file = snapshotFilePath();
  let text: string;

  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      state.values = new Map();
      return state.values;
    }

    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse snapshot file ${file}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Snapshot file ${file} must contain a JSON object.`);
  }

  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      throw new Error(
        `Snapshot "${key}" in ${file} must be a string.`,
      );
    }

    values.set(key, value);
  }

  state.values = values;
  return values;
}

export function readSnapshot(key: string): string | undefined {
  return loadValues().get(key);
}

export function writeSnapshot(key: string, value: string): void {
  const values = loadValues();
  values.set(key, value);

  const file = snapshotFilePath();
  mkdirSync(path.dirname(file), { recursive: true });

  const sorted: Record<string, string> = {};
  for (const name of [...values.keys()].sort()) {
    const stored = values.get(name);
    if (stored !== undefined) {
      sorted[name] = stored;
    }
  }

  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}
