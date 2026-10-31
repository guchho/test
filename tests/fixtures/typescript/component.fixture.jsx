import { expect, it } from '@guchho/test';

const React = {
  createElement(tag, props, ...children) {
    return { tag, props, children };
  },
};

it('runs .jsx test files', () => {
  const node = <span>world</span>;
  expect(node).toEqual({ tag: 'span', props: null, children: ['world'] });
});
