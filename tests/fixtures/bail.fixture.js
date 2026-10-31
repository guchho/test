import { it } from '@guchho/test';

it('fails first', () => {
  throw new Error('first boom');
});

it('would run later', () => {
  console.log('SECOND_TEST_RAN');
});
