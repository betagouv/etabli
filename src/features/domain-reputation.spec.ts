/**
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { estimateRequestCost, fetchBulkSummary, getMainDomain, splitDomainsIntoRequests } from '@etabli/src/features/domain-reputation';
import { getRelativeReputation } from '@etabli/src/utils/reputation';

describe('estimateRequestCost()', () => {
  it('should match the amounts observed on real responses', async () => {
    expect(estimateRequestCost(1)).toBeCloseTo(0.02003, 8);
    expect(estimateRequestCost(3)).toBeCloseTo(0.02009, 8);
  });
});

describe('getMainDomain()', () => {
  it('should stop at the registrable domain', async () => {
    expect(getMainDomain('docs.example.fr')).toBe('example.fr');
    expect(getMainDomain('beta.gouv.fr')).toBe('beta.gouv.fr');
    expect(getMainDomain('api.beta.gouv.fr')).toBe('beta.gouv.fr');
  });
});

describe('splitDomainsIntoRequests()', () => {
  it('should respect the limit of different domains', async () => {
    const domains = Array.from({ length: 250 }, (_, index) => `domain-${index}.fr`);
    const requests = splitDomainsIntoRequests(domains);

    expect(requests.map((request) => request.length)).toEqual([100, 100, 50]);
    expect(requests.flat()).toEqual(domains);
  });

  it('should not count subdomains as different domains', async () => {
    const domains = [...Array.from({ length: 150 }, (_, index) => `app-${index}.example.fr`), 'other.fr'];

    expect(splitDomainsIntoRequests(domains, 2, 1000)).toEqual([domains]);
  });

  it('should respect the limit of targets', async () => {
    const domains = Array.from({ length: 5 }, (_, index) => `app-${index}.example.fr`);

    expect(splitDomainsIntoRequests(domains, 100, 2).map((request) => request.length)).toEqual([2, 2, 1]);
  });

  it('should handle an empty list', async () => {
    expect(splitDomainsIntoRequests([])).toEqual([]);
  });
});

describe('fetchBulkSummary()', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.DATAFORSEO_LOGIN = 'login';
    process.env.DATAFORSEO_PASSWORD = 'password';
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
  });

  function mockResponse(body: unknown) {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
  }

  it('should read a response having the shape of the real one', async () => {
    mockResponse({
      status_code: 20000,
      status_message: 'Ok.',
      tasks: [
        {
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0.02009,
          result: [
            {
              total_count: 1,
              items: [
                {
                  type: 'backlinks_page_summary',
                  url: 'beta.gouv.fr',
                  rank: 62,
                  backlinks: 45039,
                  first_seen: '2019-01-16 04:11:05 +00:00',
                  backlinks_spam_score: 17,
                  referring_pages: 43731,
                  referring_domains: 2760,
                  referring_domains_nofollow: 1544,
                  referring_main_domains: 1931,
                  referring_ips: 1347,
                  broken_backlinks: 543,
                  broken_pages: 38,
                  referring_links_semantic_locations: { footer: 20251, '': 3515 },
                  referring_links_types: { anchor: 41983 },
                  referring_links_platform_types: { unknown: 41207 },
                  referring_links_countries: { FR: 37222 },
                  referring_links_tld: { fr: 15231 },
                },
              ],
            },
          ],
        },
      ],
    });

    const { items, cost } = await fetchBulkSummary(['beta.gouv.fr']);

    expect(cost).toBe(0.02009);
    expect(items[0]).toMatchObject({ url: 'beta.gouv.fr', rank: 62, referring_domains: 2760, referring_links_tld: { fr: 15231 } });

    const request = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0][1] as RequestInit & {
      body: string;
      headers: Record<string, string>;
    };

    expect(JSON.parse(request.body)).toEqual([{ targets: ['beta.gouv.fr'], include_subdomains: false, rank_scale: 'one_hundred' }]);
    expect(request.headers.Authorization).toBe(`Basic ${Buffer.from('login:password').toString('base64')}`);
  });

  it('should fail on a task error instead of considering domains as processed', async () => {
    mockResponse({
      status_code: 20000,
      status_message: 'Ok.',
      tasks: [{ status_code: 40501, status_message: 'Invalid Field', cost: 0, result: null }],
    });

    await expect(fetchBulkSummary(['beta.gouv.fr'])).rejects.toThrow('40501 Invalid Field');
  });

  it('should refuse to call the API without credentials', async () => {
    delete process.env.DATAFORSEO_LOGIN;
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(fetchBulkSummary(['beta.gouv.fr'])).rejects.toThrow('DATAFORSEO_LOGIN');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('getRelativeReputation()', () => {
  it('should be relative to the reference rank', async () => {
    expect(getRelativeReputation(33, 66)).toBe(50);
    expect(getRelativeReputation(66, 66)).toBe(100);
    expect(getRelativeReputation(1, 77)).toBe(2);
  });

  it('should be capped for the initiatives above the reference rank', async () => {
    expect(getRelativeReputation(77, 67)).toBe(100);
  });

  it('should have no value when unknown', async () => {
    expect(getRelativeReputation(null, 66)).toBeNull();
    expect(getRelativeReputation(0, null)).toBeNull();
    expect(getRelativeReputation(0, 0)).toBeNull();
  });
});
