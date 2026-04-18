export function normalizeWrappedInput(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}
