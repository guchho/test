import { Buffer } from 'node:buffer';
import path from 'node:path';

import * as ts from 'typescript';

const transformableExtensions = new Set([
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.jsx',
]);

export function isTransformableFile(filePath: string): boolean {
  return transformableExtensions.has(path.extname(filePath));
}

export function moduleFormatFor(filePath: string): 'module' | 'commonjs' {
  return path.extname(filePath) === '.cts' ? 'commonjs' : 'module';
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return diagnostics
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n',
      );

      if (diagnostic.file === undefined || diagnostic.start === undefined) {
        return message;
      }

      const position = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start,
      );

      return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}: ${message}`;
    })
    .join('\n');
}

export function transformTypeScript(source: string, fileName: string): string {
  const moduleFormat = moduleFormatFor(fileName);
  const result = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module:
        moduleFormat === 'commonjs'
          ? ts.ModuleKind.CommonJS
          : ts.ModuleKind.ESNext,
      moduleResolution:
        moduleFormat === 'commonjs'
          ? ts.ModuleResolutionKind.Node10
          : ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.React,
      allowJs: true,
      isolatedModules: true,
      esModuleInterop: true,
      sourceMap: true,
      inlineSources: true,
      inlineSourceMap: false,
      removeComments: false,
    },
  });

  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length > 0) {
    throw new SyntaxError(formatDiagnostics(errors));
  }

  if (result.sourceMapText === undefined) {
    return result.outputText;
  }

  const map = Buffer.from(result.sourceMapText, 'utf8').toString('base64');
  return `${result.outputText}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${map}\n`;
}
