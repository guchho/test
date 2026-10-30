import { it } from '@guchho/test';

it(
  'times out',
  async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  },
  10,
);
