export class AssertionError extends Error {
  override readonly name = 'AssertionError';

  constructor(message: string) {
    super(message);
  }
}
