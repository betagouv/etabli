import { getListDiff as libraryGetListDiff } from '@donedeal0/superdiff';

// This is a custom implementation to fix specific needs (ref: https://github.com/DoneDeal0/superdiff/issues/14)
export const getListDiff: typeof libraryGetListDiff = (...args) => {
  const results = libraryGetListDiff(...args);

  let deletedDiffItems = results.diff.filter((diffItem) => {
    return diffItem.status === 'deleted';
  });

  // Simulate `ignoreArrayOrder` as for some other of the library methods
  // Also infer `updated` status for items
  let tmpDiffItems: typeof deletedDiffItems = [];
  for (const diffItem of results.diff) {
    if (diffItem.status === 'moved') {
      diffItem.status = 'equal';
    } else if (diffItem.status === 'added') {
      // If also deleted we change it to `updated` while removing it from the final `deleted` list
      const correspondingDeletedItemIndex = deletedDiffItems.findIndex((deletedDiffItem) => {
        return !!deletedDiffItem.value.id && deletedDiffItem.value.id === diffItem.value.id;
      });

      if (correspondingDeletedItemIndex !== -1) {
        diffItem.status = 'updated';

        deletedDiffItems.splice(correspondingDeletedItemIndex, 1);
      }
    } else if (diffItem.status === 'deleted') {
      // We add remaining deleted items at the end
      continue;
    }

    tmpDiffItems.push(diffItem);
  }

  results.diff = [...tmpDiffItems, ...deletedDiffItems];

  return results;
};
