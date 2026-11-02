import { beforeAll, it } from '@guchho/test';

beforeAll(() => {
  throw new Error('hook setup boom');
});

it('is skipped after a hook failure', () => {
  throw new Error('This test must not run.');
});
