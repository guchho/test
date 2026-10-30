const maxDiffLines = 200;

export function formatDiff(expected: string, received: string): string {
  const expectedLines = expected.split('\n');
  const receivedLines = received.split('\n');

  if (
    expectedLines.length > maxDiffLines ||
    receivedLines.length > maxDiffLines
  ) {
    return `- ${expectedLines.join('\n- ')}\n+ ${receivedLines.join('\n+ ')}`;
  }

  const rows = expectedLines.length + 1;
  const columns = receivedLines.length + 1;
  const table: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(columns).fill(0),
  );

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const expectedLine = expectedLines[row - 1];
      const receivedLine = receivedLines[column - 1];

      table[row]![column] =
        expectedLine === receivedLine
          ? (table[row - 1]![column - 1] ?? 0) + 1
          : Math.max(
              table[row - 1]![column] ?? 0,
              table[row]![column - 1] ?? 0,
            );
    }
  }

  const lines: string[] = [];
  let row = expectedLines.length;
  let column = receivedLines.length;

  while (row > 0 || column > 0) {
    const expectedLine = expectedLines[row - 1];
    const receivedLine = receivedLines[column - 1];

    if (
      row > 0 &&
      column > 0 &&
      expectedLine === receivedLine
    ) {
      lines.push(`  ${expectedLine ?? ''}`);
      row -= 1;
      column -= 1;
    } else if (
      column > 0 &&
      (row === 0 ||
        (table[row]![column - 1] ?? 0) >= (table[row - 1]![column] ?? 0))
    ) {
      lines.push(`+ ${receivedLine ?? ''}`);
      column -= 1;
    } else {
      lines.push(`- ${expectedLine ?? ''}`);
      row -= 1;
    }
  }

  return lines.reverse().join('\n');
}
