import { expect, it } from '@guchho/test';

it('logs without failing', () => {
  console.log('fixture stdout message');
  console.warn('fixture stderr message');
  expect(true).toBe(true);
});
