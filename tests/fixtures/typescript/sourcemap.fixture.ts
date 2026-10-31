import { it } from '@guchho/test';

it('reports source-mapped stack traces', () => {
  const value: number = 1;

  throw new Error(`mapped boom ${value}`);
});
