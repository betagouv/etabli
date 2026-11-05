import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';

// Data rendered by the server is handed to the browser with the page, it must not be fetched again right after display.
// Queries using it are considered fresh during this delay, then as usual they are refreshed on the next mount
export const serverPrefetchedQueryStaleTime = minutesToMilliseconds(5);
