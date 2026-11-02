import { formatError } from '../runner/errors.js';
import type { HookError, TestResult } from '../runner/types.js';
import type { FileReport, Reporter, ReporterIO, RunReport } from './types.js';

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(3);
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return formatError(error).split('\n')[0] ?? 'Thrown value';
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.name : 'ThrownValue';
}

function testcase(result: TestResult, display: string): string {
  const attributes =
    `classname="${escapeXml(display)}" ` +
    `name="${escapeXml(result.fullName)}" ` +
    `time="${seconds(result.duration)}"`;

  if (result.status === 'passed') {
    return `    <testcase ${attributes}/>`;
  }

  if (result.status === 'skipped' || result.status === 'todo') {
    return [
      `    <testcase ${attributes}>`,
      `      <skipped message="${result.status}"/>`,
      '    </testcase>',
    ].join('\n');
  }

  return [
    `    <testcase ${attributes}>`,
    `      <failure message="${escapeXml(errorMessage(result.error))}" type="${escapeXml(errorType(result.error))}">${escapeXml(formatError(result.error))}</failure>`,
    '    </testcase>',
  ].join('\n');
}

function hookCase(error: HookError, display: string): string {
  const name = `${error.type} hook (${error.suite})`;
  return [
    `    <testcase classname="${escapeXml(display)}" name="${escapeXml(name)}" time="0.000">`,
    `      <error message="${escapeXml(errorMessage(error.error))}" type="HookError">${escapeXml(formatError(error.error))}</error>`,
    '    </testcase>',
  ].join('\n');
}

function suite(file: FileReport): string {
  const results = file.results;
  const failures = results.filter((result) => result.status === 'failed');
  const skipped = results.filter(
    (result) => result.status === 'skipped' || result.status === 'todo',
  );
  const tests = results.length + file.errors.length;
  const lines = results.map((result) => testcase(result, file.display));
  lines.push(...file.errors.map((error) => hookCase(error, file.display)));

  return [
    `  <testsuite name="${escapeXml(file.display)}" tests="${tests}" failures="${failures.length}" errors="${file.errors.length}" skipped="${skipped.length}" time="${seconds(file.duration)}">`,
    ...lines,
    '  </testsuite>',
  ].join('\n');
}

export function createJUnitReporter(io: ReporterIO): Reporter {
  return {
    onRunFinish(report: RunReport): void {
      const failures = report.files.reduce(
        (count, file) =>
          count +
          file.results.filter((result) => result.status === 'failed').length,
        0,
      );
      const errors = report.files.reduce(
        (count, file) => count + file.errors.length,
        0,
      );
      const skipped = report.files.reduce(
        (count, file) =>
          count +
          file.results.filter(
            (result) => result.status === 'skipped' || result.status === 'todo',
          ).length,
        0,
      );

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<testsuites name="guchho-test" tests="${report.summary.total + errors}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${seconds(report.duration)}">`,
        ...report.files.map(suite),
        '</testsuites>',
        '',
      ].join('\n');

      io.stdout(xml);
    },
  };
}
