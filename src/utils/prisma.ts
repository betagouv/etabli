// This is due to how the underlying search engine parses the query (https://www.postgresql.org/docs/current/datatype-textsearch.html)
// Spaces need to be escaped, they are different strategies depending of the logic or search, we chose the simpler one
// Ref: https://github.com/prisma/prisma/issues/8939
export function formatSearchQuery(query: string): string {
  return query.replace(/[\s\n\t]/g, '_');
}
