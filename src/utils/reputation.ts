// The raw score is low for public websites compared to the whole internet (even for major ones), so a summary is displayed relatively
// to the top of the platform. It's computed when reading because any new score moves the reference
//
// The reference is a high percentile and not the maximum because a single site can get a huge number of links from a few others (a link
// in the menu of a website having millions of pages), which would lower the score of all the others
export const reputationReferencePercentile = 0.99;

export function getRelativeReputation(rank: number | null, referenceRank: number | null): number | null {
  if (rank === null || !referenceRank) {
    return null;
  }

  return Math.min(Math.ceil((rank / referenceRank) * 100), 100); // Rounded up so a low score is not displayed lower than it is
}
