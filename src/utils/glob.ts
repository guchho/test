function escapeRegex(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findClosingBrace(pattern: string, openIndex: number): number {
  let depth = 0;

  for (let index = openIndex; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitAlternatives(value: string): string[] {
  const alternatives: string[] = [];
  let current = '';
  let depth = 0;

  for (const character of value) {
    if (character === ',') {
      if (depth === 0) {
        alternatives.push(current);
        current = '';
        continue;
      }
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
    }

    current += character;
  }

  alternatives.push(current);
  return alternatives;
}

function translate(pattern: string): string {
  let result = '';
  let index = 0;

  while (index < pattern.length) {
    const character = pattern[index];

    if (character === undefined) {
      break;
    }

    if (character === '*') {
      let end = index;

      while (pattern[end] === '*') {
        end += 1;
      }

      const starCount = end - index;

      if (starCount >= 2) {
        if (pattern[end] === '/') {
          result += '(?:.*/)?';
          end += 1;
        } else {
          result += '.*';
        }
      } else {
        result += '[^/]*';
      }

      index = end;
      continue;
    }

    if (character === '?') {
      result += '[^/]';
      index += 1;
      continue;
    }

    if (character === '{') {
      const closingIndex = findClosingBrace(pattern, index);

      if (closingIndex === -1) {
        result += '\\{';
        index += 1;
        continue;
      }

      const body = pattern.slice(index + 1, closingIndex);
      const alternatives = splitAlternatives(body);
      result += `(?:${alternatives.map((part) => translate(part)).join('|')})`;
      index = closingIndex + 1;
      continue;
    }

    result += escapeRegex(character);
    index += 1;
  }

  return result;
}

export function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${translate(pattern)}$`);
}

export function matchesGlob(pattern: string, value: string): boolean {
  return globToRegExp(pattern).test(value);
}

export function matchesAnyGlob(
  patterns: readonly string[],
  value: string,
): boolean {
  return patterns.some((pattern) => matchesGlob(pattern, value));
}
