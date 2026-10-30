import { describe, it, only, todo } from '@guchho/test';

it('normal test', () => {
  throw new Error('Only the focused tests should run.');
});

only('focused test', () => {});

describe('skipped suite', () => {
  it('never runs', () => {
    throw new Error('Skipped suite ran.');
  });
});

describe.skip('explicitly skipped suite', () => {
  it('never runs either', () => {
    throw new Error('Skipped suite ran.');
  });
});

describe.only('focused suite', () => {
  it('runs focused child', () => {});
});

it.skip('explicitly skipped test', () => {
  throw new Error('Skipped test ran.');
});

todo('pending test');
