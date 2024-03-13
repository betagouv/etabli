export function formatPageTitle(pageSpecificTitle: string) {
  return `${pageSpecificTitle} - Établi`;
}

export function paginate<T>(items: T[], pageSize: number, pageNumber: number) {
  // Human-readable page numbers in our application start with 1, so we reduce 1 in the first argument
  return items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
}
