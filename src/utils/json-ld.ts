// `JSON.stringify` does not escape HTML, so a value containing `</script>` (names and descriptions come from crawled websites
// through the LLM) would close the tag and inject markup into the page. Escaped characters stay identical once parsed as JSON
const unsafeCharacters: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  [String.fromCharCode(0x2028)]: '\\u2028',
  [String.fromCharCode(0x2029)]: '\\u2029',
};
const unsafeCharactersPattern = new RegExp(`[${Object.keys(unsafeCharacters).join('')}]`, 'g');

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(unsafeCharactersPattern, (character) => unsafeCharacters[character]);
}
