export function stripDashes(text: string): string {
  return text.replace(/[\u2014\u2013]/g, ", ");
}
