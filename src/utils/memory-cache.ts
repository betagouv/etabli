// Keeps results a short time in memory, and makes concurrent calls with the same key share a single computation. Meant for
// public endpoints whose answers are costly and can be slightly outdated. The oldest entries are dropped beyond the limit
export function createShortLivedCache<Value>(options: { maximumEntries: number; durationInMilliseconds: number }) {
  const entries = new Map<string, { value: Promise<Value>; expiresAt: number }>();

  return async function getOrCompute(key: string, compute: () => Promise<Value>): Promise<Value> {
    const now = Date.now();
    const existingEntry = entries.get(key);

    if (existingEntry && existingEntry.expiresAt > now) {
      // Moved to the end so the most used entries are the last to be dropped
      entries.delete(key);
      entries.set(key, existingEntry);

      return await existingEntry.value;
    }

    const value = compute();

    entries.set(key, { value: value, expiresAt: now + options.durationInMilliseconds });

    // A failure must not be served until the expiration
    value.catch(() => {
      if (entries.get(key)?.value === value) {
        entries.delete(key);
      }
    });

    while (entries.size > options.maximumEntries) {
      const oldestKey = entries.keys().next().value;

      if (oldestKey === undefined) {
        break;
      }

      entries.delete(oldestKey);
    }

    return await value;
  };
}
