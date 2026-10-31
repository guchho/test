import { expect, it } from '@guchho/test';

const React = {
  createElement(
    tag: string,
    props: unknown,
    ...children: unknown[]
  ): { tag: string; props: unknown; children: unknown[] } {
    return { tag, props, children };
  },
};

it('runs .tsx test files', () => {
  const node = <div>hello</div>;
  expect(node).toEqual({ tag: 'div', props: null, children: ['hello'] });
});
