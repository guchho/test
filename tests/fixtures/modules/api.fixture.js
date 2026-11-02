export function getUser() {
  return { id: 1, name: 'Original User' };
}

export const version = 'original';

export default function greet(name) {
  return `hello ${name}`;
}
