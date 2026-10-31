import { it, expect } from '@guchho/test';

it('runs in the first file', async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(1 + 1).toBe(2);
});
