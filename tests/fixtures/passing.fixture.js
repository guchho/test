import { describe, it, skip, test, todo } from '@guchho/test';

describe('math', () => {
  it('adds two numbers', () => {
    if (2 + 3 !== 5) {
      throw new Error('Addition is broken.');
    }
  });

  test('supports async tests', async () => {
    await Promise.resolve();
  });

  describe('nested', () => {
    it('runs nested tests', () => {});
  });

  skip('is skipped', () => {
    throw new Error('This test must not run.');
  });

  todo('is a todo');
});
