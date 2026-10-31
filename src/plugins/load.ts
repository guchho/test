import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ConfigError } from '../config/load.js';
import type { ReporterFactory } from './types.js';
import { definePlugin } from './types.js';

export type ReporterFactories = ReadonlyMap<string, ReporterFactory>;

function isPlugin(value: unknown): value is {
  readonly name: string;
  readonly reporters?: Readonly<Record<string, ReporterFactory>>;
} {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

export async function loadPlugins(
  plugins: readonly string[],
  cwd: string,
): Promise<ReporterFactories> {
  const reporters = new Map<string, ReporterFactory>();

  for (const pluginPath of plugins) {
    const file = path.resolve(cwd, pluginPath);
    let module: Record<string, unknown>;

    try {
      module = (await import(pathToFileURL(file).href)) as Record<
        string,
        unknown
      >;
    } catch (error) {
      throw new ConfigError(
        `Failed to load plugin ${pluginPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const exported = module.default ?? module.plugin;
    if (!isPlugin(exported)) {
      throw new ConfigError(
        `Plugin ${pluginPath} must export a plugin object as its default export or as "plugin".`,
      );
    }

    let plugin;
    try {
      plugin = definePlugin(exported);
    } catch (error) {
      throw new ConfigError(
        `Invalid plugin ${pluginPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    for (const [name, factory] of Object.entries(plugin.reporters ?? {})) {
      if (reporters.has(name)) {
        throw new ConfigError(
          `Reporter "${name}" is provided by more than one plugin.`,
        );
      }

      reporters.set(name, factory);
    }
  }

  return reporters;
}
