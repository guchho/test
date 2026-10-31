import type { ReporterEntry, ReporterName } from '../config/types.js';
import type { ReporterFactory } from '../plugins/types.js';
import { createDefaultReporter } from './default.js';
import { createDotReporter } from './dot.js';
import { createJsonReporter } from './json.js';
import { createJUnitReporter } from './junit.js';
import type { Reporter, ReporterIO } from './types.js';
import { createVerboseReporter } from './verbose.js';

export class ReporterError extends Error {
  override readonly name = 'ReporterError';
}

const builtInReporterNames = new Set<ReporterName>([
  'default',
  'verbose',
  'dot',
  'json',
  'junit',
]);

export function createReporter(
  name: ReporterName,
  io: ReporterIO,
): Reporter {
  switch (name) {
    case 'default':
      return createDefaultReporter(io);
    case 'verbose':
      return createVerboseReporter(io);
    case 'dot':
      return createDotReporter(io);
    case 'json':
      return createJsonReporter(io);
    case 'junit':
      return createJUnitReporter(io);
  }
}

export function createReporters(
  entries: readonly ReporterEntry[],
  io: ReporterIO,
  custom: ReadonlyMap<string, ReporterFactory> = new Map(),
): Reporter[] {
  const resolved =
    entries.length === 0
      ? (['default'] as ReporterEntry[])
      : [...entries];

  return resolved.map((entry) => {
    const name = typeof entry === 'string' ? entry : entry[0];
    const options =
      typeof entry === 'string' ? {} : entry[1];

    if (builtInReporterNames.has(name as ReporterName)) {
      return createReporter(name as ReporterName, io);
    }

    const factory = custom.get(name);
    if (factory === undefined) {
      throw new ReporterError(`Unknown reporter "${name}".`);
    }

    return factory(options, io);
  });
}

export type {
  FileReport,
  Reporter,
  ReporterIO,
  RunReport,
} from './types.js';
