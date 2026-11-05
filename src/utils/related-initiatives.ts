// How many fit on a single row depending on the screen, the server sends the largest number and the smaller screens hide the rest.
// Not in the component file, otherwise the server would only get a reference to it instead of the value
export const relatedInitiativesColumnsByBreakpoint = { xs: 1, sm: 2, md: 3, lg: 4 } as const;

export const maximumRelatedInitiatives = Math.max(...Object.values(relatedInitiativesColumnsByBreakpoint));

export interface RelatedInitiative {
  id: string;
  name: string;
  websites: string[];
  repositories: string[];
}

// The main address only (a website, otherwise a repository), skipped when the sheet is named after it since repeating it would bring nothing
export function getRelatedInitiativeMainAddress(initiative: RelatedInitiative): string | null {
  const mainAddress = initiative.websites[0] ?? initiative.repositories[0];

  if (!mainAddress) {
    return null;
  }

  const readableAddress = mainAddress.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
  const comparableName = initiative.name
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');

  return readableAddress.toLowerCase() !== comparableName ? readableAddress : null;
}
