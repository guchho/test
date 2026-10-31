import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';

interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

function normalize(file: string): string {
  let result = file.replace(/\\/g, '/');

  if (result.startsWith('file://')) {
    try {
      result = fileURLToPath(result).replace(/\\/g, '/');
    } catch {
      result = result.replace(/^file:\/\//, '');
    }
  }

  return result.toLowerCase();
}

function parseFrame(line: string): SourceLocation | undefined {
  const trimmed = line.trim();
  const withParentheses = trimmed.match(/\((.+):(\d+):(\d+)\)$/);
  const bare = trimmed.match(/at (.+):(\d+):(\d+)$/);

  const match = withParentheses ?? bare;
  if (match === null) {
    return undefined;
  }

  const file = match[1];
  const lineNumber = Number(match[2]);
  const column = Number(match[3]);

  if (
    file === undefined ||
    !Number.isInteger(lineNumber) ||
    !Number.isInteger(column)
  ) {
    return undefined;
  }

  return { file, line: lineNumber, column };
}

function callerLocation(testFile: string): SourceLocation | undefined {
  const stack = new Error().stack;
  if (stack === undefined) {
    return undefined;
  }

  const target = normalize(testFile);
  const frames = stack
    .split('\n')
    .slice(1)
    .map(parseFrame)
    .filter((frame): frame is SourceLocation => frame !== undefined);

  return frames.find((frame) => normalize(frame.file) === target);
}

function scriptKind(file: string): ts.ScriptKind {
  switch (file.slice(file.lastIndexOf('.')).toLowerCase()) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function findCall(
  sourceFile: ts.SourceFile,
  position: number,
): ts.CallExpression | undefined {
  let best: ts.CallExpression | undefined;
  let bestSpan = Number.POSITIVE_INFINITY;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const name = ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : undefined;

      if (name === 'toMatchInlineSnapshot') {
        const start = node.getStart(sourceFile);
        const end = node.getEnd();

        if (position >= start && position <= end) {
          const span = end - start;
          if (span < bestSpan) {
            best = node;
            bestSpan = span;
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return best;
}

function literal(value: string): string {
  return JSON.stringify(value);
}

function replaceInlineSnapshot(
  source: string,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  value: string,
): string {
  const argument = call.arguments[0];

  if (argument !== undefined) {
    const start = argument.getStart(sourceFile);
    const end = call.arguments[call.arguments.length - 1]?.getEnd() ?? start;
    return `${source.slice(0, start)}${literal(value)}${source.slice(end)}`;
  }

  const open = source.indexOf('(', call.expression.getEnd());
  if (open === -1) {
    throw new Error('Could not locate the inline snapshot argument list.');
  }

  return `${source.slice(0, open + 1)}${literal(value)}${source.slice(open + 1)}`;
}

export function updateInlineSnapshot(
  testFile: string,
  value: string,
): void {
  const location = callerLocation(testFile);

  if (location === undefined) {
    throw new Error(
      'Could not locate the inline snapshot call in the test source.',
    );
  }

  const file = normalize(location.file) === normalize(testFile)
    ? testFile
    : location.file;
  const source = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const position = sourceFile.getPositionOfLineAndCharacter(
    Math.max(0, location.line - 1),
    Math.max(0, location.column - 1),
  );
  const call = findCall(sourceFile, position);

  if (call === undefined) {
    throw new Error(
      'Could not locate the inline snapshot call in the test source.',
    );
  }

  writeFileSync(
    file,
    replaceInlineSnapshot(source, call, sourceFile, value),
    'utf8',
  );
}
