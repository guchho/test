import { describe, it } from '@guchho/test';

describe('failures', () => {
  it('passes', () => {});

  it('throws synchronously', () => {
    throw new Error('sync boom');
  });

  it('rejects asynchronously', async () => {
    await Promise.resolve();
    throw new Error('async boom');
  });
});
