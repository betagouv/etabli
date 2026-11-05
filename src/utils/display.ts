import { useLocalStorage } from 'usehooks-ts';

export enum ListDisplay {
  GRID = 'grid',
  TABLE = 'table',
}

export function useLocalStorageListDisplay() {
  return useLocalStorage<ListDisplay>('listDisplay', ListDisplay.GRID);
}
