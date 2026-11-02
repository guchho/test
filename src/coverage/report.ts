import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ResolvedConfig } from '../config/load.js';
import type { CoverageConfig } from '../config/types.js';
import { version } from '../version.js';
import { coveragePercentage } from './collect.js';
import type {
  CoverageMetric,
  CoverageReport,
  FileCoverage,
} from './types.js';

export interface CoverageOutput {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly machine: boolean;
}

const metrics = [
  ['statements', 'Stmts'],
  ['branches', 'Branch'],
  ['functions', 'Funcs'],
  ['lines', 'Lines'],
] as const;

function percentage(metric: CoverageMetric): string {
  return coveragePercentage(metric).toFixed(2);
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${' '.repeat(width - value.length)}`;
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : `${' '.repeat(width - value.length)}${value}`;
}

export function coverageText(report: CoverageReport): string {
  const fileWidth = Math.max(
    20,
    ...report.files.map((file) => file.path.length),
    'All files'.length,
  );
  const header = [
    pad('File', fileWidth),
    ...metrics.map(([, label]) => padStart(`% ${label}`, 10)),
  ].join(' | ');
  const separator = [
    '-'.repeat(fileWidth),
    ...metrics.map(() => '-'.repeat(10)),
  ].join('-|-');
  const lines = [header, separator];

  for (const file of report.files) {
    lines.push(
      [
        pad(file.path, fileWidth),
        ...metrics.map(([key]) =>
          padStart(percentage(file[key]), 10),
        ),
      ].join(' | '),
    );
  }

  lines.push(
    [
      pad('All files', fileWidth),
      ...metrics.map(([key]) =>
        padStart(percentage(report.totals[key]), 10),
      ),
    ].join(' | '),
  );

  return `Coverage summary\n${lines.join('\n')}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlReport(report: CoverageReport, cwd: string): string {
  const rows = report.files
    .map(
      (file) => `<tr>
  <td><a href="#${escapeHtml(file.path)}">${escapeHtml(file.path)}</a></td>
  <td>${percentage(file.statements)}</td>
  <td>${percentage(file.branches)}</td>
  <td>${percentage(file.functions)}</td>
  <td>${percentage(file.lines)}</td>
</tr>`,
    )
    .join('\n');

  const sections = report.files
    .map((file) => {
      let source: string;
      try {
        source = readFileSync(path.resolve(cwd, file.path), 'utf8');
      } catch {
        return `<section id="${escapeHtml(file.path)}"><h2>${escapeHtml(file.path)}</h2><p>Source unavailable.</p></section>`;
      }

      const annotated = source
        .split(/\r?\n/)
        .map((line, index) => {
          const hit = file.lineHits[index + 1];
          const className =
            hit === true
              ? 'covered'
              : hit === false
                ? 'uncovered'
                : 'neutral';
          return `<span class="${className}"><i>${index + 1}</i>${escapeHtml(line)}</span>`;
        })
        .join('\n');

      return `<section id="${escapeHtml(file.path)}">
<h2>${escapeHtml(file.path)}</h2>
<table><tbody><tr><th>Statements</th><th>Branches</th><th>Functions</th><th>Lines</th></tr>
<tr><td>${percentage(file.statements)}</td><td>${percentage(file.branches)}</td><td>${percentage(file.functions)}</td><td>${percentage(file.lines)}</td></tr></tbody></table>
<pre>${annotated}</pre>
</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Guchho coverage report</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;color:#1f2933;background:#fff}
table{border-collapse:collapse;margin-bottom:2rem}
th,td{border:1px solid #d9e2ec;padding:.35rem .6rem;text-align:right}
th:first-child,td:first-child{text-align:left}
pre{background:#f7f9fb;padding:1rem;overflow:auto;line-height:1.45}
pre span{display:block;white-space:pre}
pre span.covered{background:#e3f9e5}
pre span.uncovered{background:#ffe3e3}
pre i{display:inline-block;width:3.5rem;color:#829ab1;font-style:normal;user-select:none}
section{margin-top:2rem}
</style>
</head>
<body>
<h1>Coverage report</h1>
<table>
<thead><tr><th>File</th><th>% Stmts</th><th>% Branch</th><th>% Funcs</th><th>% Lines</th></tr></thead>
<tbody>
<tr><td><strong>All files</strong></td><td>${percentage(report.totals.statements)}</td><td>${percentage(report.totals.branches)}</td><td>${percentage(report.totals.functions)}</td><td>${percentage(report.totals.lines)}</td></tr>
${rows}
</tbody>
</table>
${sections}
</body>
</html>
`;
}

function jsonReport(report: CoverageReport): string {
  return `${JSON.stringify(
    {
      totals: report.totals,
      files: report.files,
    },
    null,
    2,
  )}\n`;
}

function sortedLineHits(file: FileCoverage): [number, boolean][] {
  return Object.entries(file.lineHits)
    .map(([line, hit]) => [Number(line), hit] as [number, boolean])
    .sort((left, right) => left[0] - right[0]);
}

function lcovReport(report: CoverageReport): string {
  const lines: string[] = [];

  for (const file of report.files) {
    lines.push('TN:');
    lines.push(`SF:${file.path}`);
    lines.push(`FNF:${file.functions.total}`);
    lines.push(`FNH:${file.functions.covered}`);
    lines.push(`BRF:${file.branches.total}`);
    lines.push(`BRH:${file.branches.covered}`);

    for (const [line, hit] of sortedLineHits(file)) {
      lines.push(`DA:${line},${hit ? 1 : 0}`);
    }

    lines.push(`LF:${file.lines.total}`);
    lines.push(`LH:${file.lines.covered}`);
    lines.push('end_of_record');
  }

  return `${lines.join('\n')}\n`;
}

function coverageRate(metric: CoverageMetric): string {
  return (coveragePercentage(metric) / 100).toFixed(4);
}

function coberturaReport(report: CoverageReport, cwd: string): string {
  const files = report.files
    .map((file) => {
      const lineHits = sortedLineHits(file)
        .map(
          ([line, hit]) =>
            `        <line number="${line}" hits="${hit ? 1 : 0}"/>`,
        )
        .join('\n');

      return `      <class name="${escapeHtml(file.path)}" filename="${escapeHtml(file.path)}" line-rate="${coverageRate(file.lines)}" branch-rate="${coverageRate(file.branches)}" complexity="0">
        <methods/>
        <lines>
${lineHits}
        </lines>
      </class>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">
<coverage line-rate="${coverageRate(report.totals.lines)}" branch-rate="${coverageRate(report.totals.branches)}" lines-covered="${report.totals.lines.covered}" lines-valid="${report.totals.lines.total}" branches-covered="${report.totals.branches.covered}" branches-valid="${report.totals.branches.total}" complexity="0" version="${version}" timestamp="${Date.now()}">
  <sources>
    <source>${escapeHtml(cwd)}</source>
  </sources>
  <packages>
    <package name="guchho-test" line-rate="${coverageRate(report.totals.lines)}" branch-rate="${coverageRate(report.totals.branches)}" complexity="0">
      <classes>
${files}
      </classes>
    </package>
  </packages>
</coverage>
`;
}

export function writeCoverageReport(
  report: CoverageReport,
  config: Readonly<CoverageConfig>,
  cwd: string,
  output: CoverageOutput,
): void {
  const reporters = config.reporter ?? ['text', 'html'];
  const directory = path.resolve(cwd, config.reportsDirectory ?? 'coverage');
  let hasText = false;

  for (const reporter of reporters) {
    if (reporter === 'text') {
      hasText = true;
    } else if (reporter === 'html') {
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        path.join(directory, 'index.html'),
        htmlReport(report, cwd),
        'utf8',
      );
    } else if (reporter === 'json') {
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        path.join(directory, 'coverage.json'),
        jsonReport(report),
        'utf8',
      );
    } else if (reporter === 'lcov') {
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        path.join(directory, 'lcov.info'),
        lcovReport(report),
        'utf8',
      );
    } else if (reporter === 'cobertura') {
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        path.join(directory, 'cobertura-coverage.xml'),
        coberturaReport(report, cwd),
        'utf8',
      );
    }
  }

  if (hasText) {
    const text = coverageText(report);
    if (output.machine) {
      output.stderr(text);
    } else {
      output.stdout(text);
    }
  }
}

const coverageMetrics = [
  'statements',
  'branches',
  'functions',
  'lines',
] as const;

type CoverageMetricName = (typeof coverageMetrics)[number];

export interface ThresholdFailure {
  readonly metric: CoverageMetricName;
  readonly expected: number;
  readonly actual: number;
  readonly file?: string;
}

export function checkThresholds(
  report: CoverageReport,
  config: Readonly<CoverageConfig>,
): ThresholdFailure[] {
  const thresholds = config.thresholds;
  if (thresholds === undefined) {
    return [];
  }

  const failures: ThresholdFailure[] = [];
  const targets =
    thresholds.perFile === true
      ? report.files.map((file) => ({
          file: file.path,
          metrics: file as Partial<Record<CoverageMetricName, CoverageMetric>>,
        }))
      : [
          {
            file: undefined,
            metrics: report.totals as Partial<
              Record<CoverageMetricName, CoverageMetric>
            >,
          },
        ];

  for (const target of targets) {
    for (const metric of coverageMetrics) {
      const expected = thresholds[metric];
      const value = target.metrics[metric];
      if (expected === undefined || value === undefined) {
        continue;
      }

      const actual = coveragePercentage(value);
      if (actual + Number.EPSILON < expected) {
        failures.push({
          metric,
          expected,
          actual,
          ...(target.file === undefined ? {} : { file: target.file }),
        });
      }
    }
  }

  return failures;
}

export type { CoverageConfig, FileCoverage, ResolvedConfig };
