import { readFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { fileURLToPath } from 'node:url';

import { getTransformedSource } from './sources.js';
import type {
  CoverageFunction,
  CoveragePayload,
  CoverageScript,
} from './types.js';

interface InspectorResult {
  readonly result?: readonly CoverageScript[];
}

function post(
  session: Session,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    session.post(method, params, (error, result) => {
      if (error !== null) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

function sourceFor(url: string): string | undefined {
  const transformed = getTransformedSource(url);
  if (transformed !== undefined) {
    return transformed;
  }

  try {
    return readFileSync(fileURLToPath(url), 'utf8');
  } catch {
    return undefined;
  }
}

export class CoverageCollector {
  readonly #session: Session;

  private constructor(session: Session) {
    this.#session = session;
  }

  static async start(): Promise<CoverageCollector> {
    const session = new Session();
    session.connect();

    try {
      await post(session, 'Profiler.enable');
      await post(session, 'Profiler.startPreciseCoverage', {
        callCount: true,
        detailed: true,
      });
    } catch (error) {
      session.disconnect();
      throw error;
    }

    return new CoverageCollector(session);
  }

  async stop(): Promise<CoveragePayload> {
    const session = this.#session;

    try {
      const result = (await post(
        session,
        'Profiler.takePreciseCoverage',
      )) as InspectorResult;
      await post(session, 'Profiler.stopPreciseCoverage');
      await post(session, 'Profiler.disable');

      const scripts: CoverageScript[] = [];
      const sources: Record<string, string> = {};

      for (const script of result.result ?? []) {
        if (!script.url.startsWith('file:')) {
          continue;
        }

        const source = sourceFor(script.url);
        if (source === undefined) {
          continue;
        }

        sources[script.url] = source;
        scripts.push({
          scriptId: script.scriptId,
          url: script.url,
          functions: script.functions.map(
            (fn): CoverageFunction => ({
              functionName: fn.functionName,
              isBlockCoverage: fn.isBlockCoverage,
              ranges: fn.ranges.map((range) => ({
                startOffset: range.startOffset,
                endOffset: range.endOffset,
                count: range.count,
              })),
            }),
          ),
        });
      }

      return { scripts, sources };
    } finally {
      session.disconnect();
    }
  }
}
