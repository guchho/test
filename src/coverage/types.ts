export interface CoverageRange {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly count: number;
}

export interface CoverageFunction {
  readonly functionName: string;
  readonly ranges: readonly CoverageRange[];
  readonly isBlockCoverage: boolean;
}

export interface CoverageScript {
  readonly scriptId: string;
  readonly url: string;
  readonly functions: readonly CoverageFunction[];
}

export interface CoveragePayload {
  readonly scripts: readonly CoverageScript[];
  readonly sources: Readonly<Record<string, string>>;
}

export interface CoverageMetric {
  readonly total: number;
  readonly covered: number;
}

export interface FileCoverage {
  readonly path: string;
  readonly lines: CoverageMetric;
  readonly functions: CoverageMetric;
  readonly branches: CoverageMetric;
  readonly statements: CoverageMetric;
  readonly lineHits: Readonly<Record<number, boolean>>;
}

export interface CoverageTotals {
  readonly lines: CoverageMetric;
  readonly functions: CoverageMetric;
  readonly branches: CoverageMetric;
  readonly statements: CoverageMetric;
}

export interface CoverageReport {
  readonly files: readonly FileCoverage[];
  readonly totals: CoverageTotals;
}
