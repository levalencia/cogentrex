export function extractCitationNumbers(content: string): number[] {
  return Array.from(content.matchAll(/\[(\d+)]/g), (match) => Number(match[1]))
    .filter((value, index, values) => Number.isInteger(value) && values.indexOf(value) === index);
}
