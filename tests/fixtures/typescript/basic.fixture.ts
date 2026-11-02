import { describe, expect, it } from '@guchho/test';

interface Point {
  readonly x: number;
  readonly y: number;
}

describe('typescript', () => {
  it('runs .ts test files', () => {
    const point: Point = { x: 1, y: 2 };
    expect(point).toEqual({ x: 1, y: 2 });
  });

  it('supports TypeScript-only syntax', () => {
    enum Colour {
      Red = 'red',
      Blue = 'blue',
    }

    const current: Colour = Colour.Blue;
    expect(current).toBe('blue');
  });
});
