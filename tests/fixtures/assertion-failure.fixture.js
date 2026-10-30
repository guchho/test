import { expect, it } from '@guchho/test';

it('fails with assertion diagnostics', () => {
  expect({ value: 1 }).toEqual({ value: 2 });
});
