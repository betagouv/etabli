import { LiteInitiativeMapSchemaType } from '@etabli/src/models/entities/initiative';

// When several websites/repositories end up being gathered, some initiative maps disappear with their items now part of another
// existing map. Their initiative is a duplicate of the one from this map, whereas removed maps whose items are no longer
// listed (or only moved to a new map, whose initiative has yet to be computed) must keep it.
export function getMergedInitiativeMapsIdentifiers(
  removedInitiativeMaps: LiteInitiativeMapSchemaType[],
  remainingInitiativeMaps: LiteInitiativeMapSchemaType[]
): string[] {
  const remainingItemsIds = new Set(
    remainingInitiativeMaps.flatMap((initiativeMap) => [...initiativeMap.rawDomainsIds, ...initiativeMap.rawRepositoriesIds])
  );

  return removedInitiativeMaps
    .filter((initiativeMap) => [...initiativeMap.rawDomainsIds, ...initiativeMap.rawRepositoriesIds].some((itemId) => remainingItemsIds.has(itemId)))
    .map((initiativeMap) => initiativeMap.mainItemIdentifier);
}
