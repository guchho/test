import { it, expect } from '@guchho/test';

it('runs in the second file', async () => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(2 + 2).toBe(4);
});
