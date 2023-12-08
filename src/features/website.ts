import substrings from 'common-substrings';

export function guessWebsiteNameFromPageTitles(title1: string, title2: string): string | null {
  const result = substrings([title1, title2], {
    minOccurrence: 2,
    minLength: 3,
  });

  if (result.length === 0) {
    return null;
  }

  const mainCommonPattern = result.sort((a, b) => b.weight - a.weight)[0].name;

  // We make sure to trim spaces and isolated special characters like in `- react-dsfr` (can be at start or at the end)
  return mainCommonPattern.replace(/^\s*[^\w]+|\s*[^\w]+\s*$/g, '').trim();
}
