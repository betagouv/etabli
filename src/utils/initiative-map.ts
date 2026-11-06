import { LiteInitiativeMapSchemaType } from '@etabli/src/models/entities/initiative';

// When several websites/repositories end up being gathered, some initiative maps disappear with their items now part of another
// existing map. Their initiative is a duplicate of the one from this map, whereas removed maps whose items are no longer
// listed must keep it (and for those moved to a new map see `getMovedInitiativeMaps()`).
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

export interface MovedInitiativeMaps {
  moved: { fromMainItemIdentifier: string; toMainItemIdentifier: string }[]; // A new map takes over the initiative of the removed one
  duplicated: string[]; // Removed maps moved to a new map that already takes over another initiative
}

// When the main item of a group changes, the map is seen as removed and another one as added. Its initiative must follow the new map
// (keeping its identifier and URL), otherwise it would stay without origin while the new map computes a second one.
// A new map can only have one initiative: it takes the one sharing the most items.
export function getMovedInitiativeMaps(
  removedInitiativeMaps: LiteInitiativeMapSchemaType[],
  addedInitiativeMaps: LiteInitiativeMapSchemaType[]
): MovedInitiativeMaps {
  const addedMainItemIdentifierByItemId = new Map(
    addedInitiativeMaps.flatMap((initiativeMap) =>
      [...initiativeMap.rawDomainsIds, ...initiativeMap.rawRepositoriesIds].map((itemId) => [itemId, initiativeMap.mainItemIdentifier] as const)
    )
  );

  const candidates = removedInitiativeMaps
    .flatMap((initiativeMap) => {
      const sharedItemsCounts = new Map<string, number>();
      for (const itemId of [...initiativeMap.rawDomainsIds, ...initiativeMap.rawRepositoriesIds]) {
        const toMainItemIdentifier = addedMainItemIdentifierByItemId.get(itemId);

        if (toMainItemIdentifier) {
          sharedItemsCounts.set(toMainItemIdentifier, (sharedItemsCounts.get(toMainItemIdentifier) ?? 0) + 1);
        }
      }

      return [...sharedItemsCounts].map(([toMainItemIdentifier, sharedItemsCount]) => ({
        fromMainItemIdentifier: initiativeMap.mainItemIdentifier,
        toMainItemIdentifier: toMainItemIdentifier,
        sharedItemsCount: sharedItemsCount,
      }));
    })
    .sort(
      (a, b) =>
        b.sharedItemsCount - a.sharedItemsCount ||
        a.fromMainItemIdentifier.localeCompare(b.fromMainItemIdentifier) ||
        a.toMainItemIdentifier.localeCompare(b.toMainItemIdentifier)
    );

  const moved: MovedInitiativeMaps['moved'] = [];
  const movedFrom = new Set<string>();
  const movedTo = new Set<string>();
  for (const { fromMainItemIdentifier, toMainItemIdentifier } of candidates) {
    if (!movedFrom.has(fromMainItemIdentifier) && !movedTo.has(toMainItemIdentifier)) {
      moved.push({ fromMainItemIdentifier: fromMainItemIdentifier, toMainItemIdentifier: toMainItemIdentifier });
      movedFrom.add(fromMainItemIdentifier);
      movedTo.add(toMainItemIdentifier);
    }
  }

  return {
    moved: moved,
    duplicated: [...new Set(candidates.map((candidate) => candidate.fromMainItemIdentifier))].filter((identifier) => !movedFrom.has(identifier)),
  };
}
