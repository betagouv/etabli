/**
 * @jest-environment node
 */
import { getListDiff as libraryGetListDiff } from '@donedeal0/superdiff';

import { getListDiff } from '@etabli/src/utils/comparaison';

describe('getListDiff()', () => {
  it('should recognize same objects based on id in the list', async () => {
    const before = [
      { id: 1, myProp: 1 },
      { id: 2, myProp: 2 },
      { id: 3, myProp: 3 },
    ];
    const after = [
      { id: 2, myProp: 222 },
      { id: 3, myProp: 3 },
      { id: 4, myProp: 4 },
    ];

    const libraryDiffResult = libraryGetListDiff(before, after);

    // The library will by default not recognized `updated` objects due to not considering stable IDs
    expect(libraryDiffResult).toStrictEqual({
      diff: [
        {
          indexDiff: null,
          newIndex: null,
          prevIndex: 0,
          status: 'deleted',
          value: {
            id: 1,
            myProp: 1,
          },
        },
        {
          indexDiff: null,
          newIndex: null,
          prevIndex: 1,
          status: 'deleted',
          value: {
            id: 2,
            myProp: 2,
          },
        },
        {
          indexDiff: null,
          newIndex: 0,
          prevIndex: null,
          status: 'added',
          value: {
            id: 2,
            myProp: 222,
          },
        },
        {
          indexDiff: -1,
          newIndex: 1,
          prevIndex: 2,
          status: 'moved',
          value: {
            id: 3,
            myProp: 3,
          },
        },
        {
          indexDiff: null,
          newIndex: 2,
          prevIndex: null,
          status: 'added',
          value: {
            id: 4,
            myProp: 4,
          },
        },
      ],
      status: 'updated',
      type: 'list',
    });

    const diffResult = getListDiff(before, after, {
      referenceProperty: 'id',
    });

    // Our own wrapper around the library function should fix those
    expect(diffResult).toStrictEqual({
      diff: [
        {
          indexDiff: null,
          newIndex: 0,
          prevIndex: null,
          status: 'updated',
          value: {
            id: 2,
            myProp: 222,
          },
        },
        {
          indexDiff: -1,
          newIndex: 1,
          prevIndex: 2,
          status: 'equal',
          value: {
            id: 3,
            myProp: 3,
          },
        },
        {
          indexDiff: null,
          newIndex: 2,
          prevIndex: null,
          status: 'added',
          value: {
            id: 4,
            myProp: 4,
          },
        },
        {
          indexDiff: null,
          newIndex: null,
          prevIndex: 0,
          status: 'deleted',
          value: {
            id: 1,
            myProp: 1,
          },
        },
      ],
      status: 'updated',
      type: 'list',
    });
  });
});
