import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from '@guchho/test';

const events = [];

beforeAll(() => {
  events.push('beforeAll');
});

beforeEach(() => {
  events.push('beforeEach');
});

afterEach(() => {
  events.push('afterEach');
});

afterAll(() => {
  events.push('afterAll');
});

describe('lifecycle', () => {
  it('runs hooks in order', () => {
    events.push('test');
    expect(events).toEqual(['beforeAll', 'beforeEach', 'test']);
  });
});

describe('mocks', () => {
  it('tracks mock calls', () => {
    const fn = mock.fn((value) => value + 1);

    expect(fn(1)).toBe(2);
    expect(fn).toHaveBeenCalled();
    expect(fn).toHaveBeenCalledWith(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('mocks modules', async () => {
    mock.module('./modules/api.fixture.js', () => ({
      getUser: () => ({ id: 7, name: 'Mock User' }),
      version: 'mocked',
    }));

    const api = await import('./modules/api.fixture.js');

    expect(api.getUser()).toEqual({ id: 7, name: 'Mock User' });
    expect(api.version).toBe('mocked');
  });
});
