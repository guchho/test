import path from 'node:path';

import { matchesAnyGlob } from '../utils/glob.js';
import { parseSourceMap } from './source-map.js';
import type { SourceMapEntry } from './source-map.js';
import type {
  CoverageFunction,
  CoverageMetric,
  CoveragePayload,
  CoverageRange,
  CoverageReport,
  CoverageScript,
  CoverageTotals,
  FileCoverage,
} from './types.js';

interface MutableMetric {
  total: number;
  covered: number;
}

interface MutableFile {
  readonly path: string;
  readonly lineHits: Map<number, boolean>;
  readonly functions: MutableMetric;
  readonly branches: MutableMetric;
  readonly statements: MutableMetric;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function metric(): MutableMetric {
  return { total: 0, covered: 0 };
}

function addMetric(target: MutableMetric, source: MutableMetric): void {
  target.total += source.total;
  target.covered += source.covered;
}

function frozenMetric(value: MutableMetric): CoverageMetric {
  return { total: value.total, covered: value.covered };
}

function lineStarts(source: string): number[] {
  const starts = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') {
      starts.push(index + 1);
    }
  }

  return starts;
}

function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const start = starts[middle];
    const next = starts[middle + 1];

    if (start === undefined) {
      break;
    }

    if (offset < start) {
      high = middle - 1;
    } else if (next !== undefined && offset >= next) {
      low = middle + 1;
    } else {
      return middle;
    }
  }

  return Math.max(0, Math.min(low, starts.length - 1));
}

function compareRanges(left: CoverageRange, right: CoverageRange): number {
  if (left.startOffset !== right.startOffset) {
    return left.startOffset - right.startOffset;
  }

  return right.endOffset - left.endOffset;
}

function countAt(
  ranges: readonly CoverageRange[],
  offset: number,
): number {
  let low = 0;
  let high = ranges.length - 1;
  let index = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = ranges[middle];

    if (range === undefined) {
      break;
    }

    if (range.startOffset <= offset) {
      index = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  for (let current = index; current >= 0; current -= 1) {
    const range = ranges[current];
    if (range !== undefined && range.endOffset > offset) {
      return range.count;
    }
  }

  return 0;
}

function allRanges(script: CoverageScript): CoverageRange[] {
  const ranges: CoverageRange[] = [];

  for (const fn of script.functions) {
    ranges.push(...fn.ranges);
  }

  ranges.sort(compareRanges);
  return ranges;
}

function entriesByLine(
  entries: readonly SourceMapEntry[],
): Map<number, SourceMapEntry[]> {
  const map = new Map<number, SourceMapEntry[]>();

  for (const entry of entries) {
    let values = map.get(entry.generatedLine);
    if (values === undefined) {
      values = [];
      map.set(entry.generatedLine, values);
    }

    values.push(entry);
  }

  return map;
}

function mappedEntry(
  entries: readonly SourceMapEntry[],
  column: number,
): SourceMapEntry | undefined {
  let result: SourceMapEntry | undefined;

  for (const entry of entries) {
    if (entry.generatedColumn <= column) {
      result = entry;
    } else {
      break;
    }
  }

  return result;
}

function shouldInclude(
  cwd: string,
  file: string,
  include: readonly string[],
  exclude: readonly string[],
): boolean {
  const relative = toPosix(path.relative(cwd, file));

  if (
    relative.length === 0 ||
    relative.startsWith('../') ||
    path.isAbsolute(relative)
  ) {
    return false;
  }

  if (matchesAnyGlob(exclude, relative)) {
    return false;
  }

  return matchesAnyGlob(include, relative);
}

function fileFor(
  files: Map<string, MutableFile>,
  cwd: string,
  sourcePath: string,
): MutableFile {
  const relative = toPosix(path.relative(cwd, sourcePath));
  let file = files.get(relative);

  if (file === undefined) {
    file = {
      path: relative,
      lineHits: new Map(),
      functions: metric(),
      branches: metric(),
      statements: metric(),
    };
    files.set(relative, file);
  }

  return file;
}

function addMappedLine(
  file: MutableFile,
  originalLine: number,
  count: number,
): void {
  const line = originalLine + 1;
  const current = file.lineHits.get(line) ?? false;
  file.lineHits.set(line, current || count > 0);
}

function isModuleWrapper(
  fn: CoverageFunction,
  sourceLength: number,
): boolean {
  const range = fn.ranges[0];
  return (
    fn.functionName.length === 0 &&
    range !== undefined &&
    range.startOffset === 0 &&
    range.endOffset > sourceLength / 2
  );
}

function addMappedFunctions(
  file: MutableFile,
  script: CoverageScript,
  starts: readonly number[],
  entries: Map<number, SourceMapEntry[]>,
  sourcePath: string,
  sourceLength: number,
): void {
  for (const fn of script.functions) {
    if (isModuleWrapper(fn, sourceLength)) {
      continue;
    }

    const range = fn.ranges[0];
    if (range === undefined) {
      continue;
    }

    const line = lineAt(starts, range.startOffset);
    const column = range.startOffset - (starts[line] ?? 0);
    const entry = mappedEntry(entries.get(line) ?? [], column);
    if (
      entry === undefined ||
      path.resolve(entry.sourcePath) !== path.resolve(sourcePath)
    ) {
      continue;
    }

    file.functions.total += 1;
    if (range.count > 0) {
      file.functions.covered += 1;
    }

    for (let index = 0; index < fn.ranges.length; index += 1) {
      const block = fn.ranges[index];
      if (block === undefined) {
        continue;
      }

      file.statements.total += 1;
      if (block.count > 0) {
        file.statements.covered += 1;
      }

      if (index > 0) {
        file.branches.total += 1;
        if (block.count > 0) {
          file.branches.covered += 1;
        }
      }
    }
  }
}

function addIdentityCoverage(
  file: MutableFile,
  source: string,
  script: CoverageScript,
): void {
  const starts = lineStarts(source);
  const ranges = allRanges(script);

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    if (start === undefined) {
      continue;
    }

    const end = starts[index + 1] ?? source.length;
    const text = source.slice(start, end).trim();

    if (
      text.length === 0 ||
      text.startsWith('//') ||
      text.startsWith('/*') ||
      text.startsWith('*') ||
      /^[})\];,]+$/.test(text)
    ) {
      continue;
    }

    const first = source.slice(start, end).search(/\S/);
    const offset = start + Math.max(0, first);
    const covered = countAt(ranges, offset) > 0;
    file.lineHits.set(index + 1, covered);
  }

  for (const fn of script.functions) {
    if (isModuleWrapper(fn, source.length)) {
      continue;
    }

    const range = fn.ranges[0];
    if (range !== undefined) {
      file.functions.total += 1;
      if (range.count > 0) {
        file.functions.covered += 1;
      }
    }

    for (let index = 0; index < fn.ranges.length; index += 1) {
      const block = fn.ranges[index];
      if (block === undefined) {
        continue;
      }

      file.statements.total += 1;
      if (block.count > 0) {
        file.statements.covered += 1;
      }

      if (index > 0) {
        file.branches.total += 1;
        if (block.count > 0) {
          file.branches.covered += 1;
        }
      }
    }
  }
}

function addScriptCoverage(
  files: Map<string, MutableFile>,
  script: CoverageScript,
  generated: string,
  cwd: string,
  include: readonly string[],
  exclude: readonly string[],
): void {
  const scriptPath = new URL(script.url).pathname;
  const filePath = process.platform === 'win32'
    ? decodeURIComponent(scriptPath).replace(/^\//, '')
    : decodeURIComponent(scriptPath);
  const parsed = parseSourceMap(filePath, generated);

  if (parsed === undefined) {
    if (!shouldInclude(cwd, filePath, include, exclude)) {
      return;
    }

    const file = fileFor(files, cwd, filePath);
    addIdentityCoverage(file, generated, script);
    return;
  }

  const starts = lineStarts(generated);
  const byLine = entriesByLine(parsed.entries);
  const ranges = allRanges(script);
  const touched = new Set<string>();

  for (const entry of parsed.entries) {
    if (!shouldInclude(cwd, entry.sourcePath, include, exclude)) {
      continue;
    }

    const lineStart = starts[entry.generatedLine] ?? 0;
    const offset = lineStart + entry.generatedColumn;
    const covered = countAt(ranges, offset) > 0;
    const file = fileFor(files, cwd, entry.sourcePath);
    addMappedLine(file, entry.originalLine, covered ? 1 : 0);
    touched.add(entry.sourcePath);
  }

  for (const sourcePath of touched) {
    const file = fileFor(files, cwd, sourcePath);
    addMappedFunctions(
      file,
      script,
      starts,
      byLine,
      sourcePath,
      generated.length,
    );
  }
}

export interface BuildCoverageOptions {
  readonly cwd: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly payloads: readonly CoveragePayload[];
}

export function buildCoverageReport(
  options: BuildCoverageOptions,
): CoverageReport {
  const files = new Map<string, MutableFile>();

  for (const payload of options.payloads) {
    for (const script of payload.scripts) {
      const generated = payload.sources[script.url];
      if (generated === undefined) {
        continue;
      }

      addScriptCoverage(
        files,
        script,
        generated,
        options.cwd,
        options.include,
        options.exclude,
      );
    }
  }

  const sorted = [...files.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );

  const fileReports: FileCoverage[] = sorted.map((file) => ({
    path: file.path,
    lines: {
      total: file.lineHits.size,
      covered: [...file.lineHits.values()].filter(Boolean).length,
    },
    functions: frozenMetric(file.functions),
    branches: frozenMetric(file.branches),
    statements: frozenMetric(file.statements),
    lineHits: Object.fromEntries(
      [...file.lineHits.entries()].sort(([left], [right]) => left - right),
    ),
  }));

  const totals = {
    lines: metric(),
    functions: metric(),
    branches: metric(),
    statements: metric(),
  };

  for (const file of fileReports) {
    addMetric(totals.lines, file.lines);
    addMetric(totals.functions, file.functions);
    addMetric(totals.branches, file.branches);
    addMetric(totals.statements, file.statements);
  }

  const frozenTotals: CoverageTotals = {
    lines: frozenMetric(totals.lines),
    functions: frozenMetric(totals.functions),
    branches: frozenMetric(totals.branches),
    statements: frozenMetric(totals.statements),
  };

  return { files: fileReports, totals: frozenTotals };
}

export function coveragePercentage(metricValue: CoverageMetric): number {
  return metricValue.total === 0
    ? 100
    : (metricValue.covered / metricValue.total) * 100;
}

export type { CoverageFunction };
