/**
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createShortLivedCache } from '@etabli/src/utils/memory-cache';

describe('createShortLivedCache()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should share a computation until it expires', async () => {
    const getOrCompute = createShortLivedCache<number>({ maximumEntries: 10, durationInMilliseconds: 1000 });
    const compute = jest.fn(async () => 1);

    await Promise.all([getOrCompute('a', compute), getOrCompute('a', compute)]);
    expect(compute).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1001);
    await getOrCompute('a', compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('should not keep a failure', async () => {
    const getOrCompute = createShortLivedCache<number>({ maximumEntries: 10, durationInMilliseconds: 1000 });

    await expect(getOrCompute('a', async () => Promise.reject(new Error('failure')))).rejects.toThrow('failure');
    await expect(getOrCompute('a', async () => 2)).resolves.toBe(2);
  });

  it('should drop the least used entries beyond the limit', async () => {
    const getOrCompute = createShortLivedCache<string>({ maximumEntries: 2, durationInMilliseconds: 1000 });
    const compute = jest.fn(async () => 'value');

    await getOrCompute('a', compute);
    await getOrCompute('b', compute);
    await getOrCompute('a', compute); // `b` is now the least used
    await getOrCompute('c', compute);
    expect(compute).toHaveBeenCalledTimes(3);

    await getOrCompute('a', compute);
    expect(compute).toHaveBeenCalledTimes(3);
    await getOrCompute('b', compute);
    expect(compute).toHaveBeenCalledTimes(4);
  });
});
