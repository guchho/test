import type { GuchhoConfig } from './types.js';

export function defineConfig(config: GuchhoConfig): GuchhoConfig;
export function defineConfig(
  config: Promise<GuchhoConfig>,
): Promise<GuchhoConfig>;
export function defineConfig(
  config: GuchhoConfig | Promise<GuchhoConfig>,
): GuchhoConfig | Promise<GuchhoConfig> {
  return config;
}
