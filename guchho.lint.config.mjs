export default {
  exclude: ['coverage/**', 'dist/**', 'node_modules/**', 'tests/fixtures/**'],
  platform: 'node',
  rules: {
    // TypeScript already enforces unused locals and parameters.
    'no-unused-vars': 'off',
    'no-empty': 'off',
  },
};
