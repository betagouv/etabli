export enum ListDisplay {
  GRID = 'grid',
  TABLE = 'table',
}

// Kept in a cookie and not in the browser storage, so the server renders directly the display chosen by the visitor
export const listDisplayCookieName = 'listDisplay';

export function parseListDisplay(value: string | null | undefined): ListDisplay {
  return value === ListDisplay.TABLE ? ListDisplay.TABLE : ListDisplay.GRID;
}
