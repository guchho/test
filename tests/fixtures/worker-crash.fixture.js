import { it } from '@guchho/test';

it('crashes the worker', () => {
  process.exit(1);
});
