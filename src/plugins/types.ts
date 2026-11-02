import type { Reporter, ReporterIO } from '../reporters/types.js';

export type ReporterFactory = (
  options: Record<string, unknown>,
  io: ReporterIO,
) => Reporter;

export interface GuchhoPlugin {
  readonly name: string;
  readonly reporters?: Readonly<Record<string, ReporterFactory>>;
}

export function defineReporter(factory: ReporterFactory): ReporterFactory {
  return factory;
}

export function definePlugin(plugin: GuchhoPlugin): GuchhoPlugin {
  if (
    plugin === null ||
    typeof plugin !== 'object' ||
    typeof plugin.name !== 'string' ||
    plugin.name.trim().length === 0
  ) {
    throw new TypeError('A plugin must have a non-empty name.');
  }

  if (plugin.reporters !== undefined) {
    if (
      plugin.reporters === null ||
      typeof plugin.reporters !== 'object' ||
      Array.isArray(plugin.reporters)
    ) {
      throw new TypeError('Plugin reporters must be an object.');
    }

    for (const [name, factory] of Object.entries(plugin.reporters)) {
      if (name.trim().length === 0) {
        throw new TypeError('Plugin reporter names must be non-empty.');
      }

      if (typeof factory !== 'function') {
        throw new TypeError(
          `Plugin reporter "${name}" must be a factory function.`,
        );
      }
    }
  }

  return plugin;
}
