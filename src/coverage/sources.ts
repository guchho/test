const transformedSources = new Map<string, string>();

function key(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  return parsed.href;
}

export function recordTransformedSource(url: string, source: string): void {
  transformedSources.set(key(url), source);
}

export function getTransformedSource(url: string): string | undefined {
  return transformedSources.get(key(url));
}
