import { describe, expect, it } from '@guchho/test';

describe('assertions', () => {
  it('passes synchronous matcher checks', () => {
    expect(2 + 3).toBe(5);
    expect({ name: 'Guchho' }).toEqual({ name: 'Guchho' });
    expect('hello').toContain('ell');
  });

  it('passes asynchronous matcher checks', async () => {
    await expect(Promise.resolve(1)).resolves.toBe(1);
    await expect(Promise.reject(new Error('boom'))).rejects.toThrow('boom');
  });
});
