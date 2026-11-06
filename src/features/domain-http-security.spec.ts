/**
 * @jest-environment node
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { fetchObservatoryResult, observatoryAnalyzeUrl } from '@etabli/src/features/domain-http-security';

describe('fetchObservatoryResult()', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should keep the grade and ignore the other fields of the response', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          history: [],
          scan: { grade: 'F', score: 0, tests_passed: 5, tests_failed: 5, tests_quantity: 10, response_headers: { server: 'Apache' } },
          tests: { cookies: { pass: null, result: 'cookies-not-found', score_modifier: 0, title: 'Cookies' } },
        })
      )
    );

    const result = await fetchObservatoryResult('www.example.fr');

    expect(fetchSpy.mock.calls[0][0]).toBe(`${observatoryAnalyzeUrl}?host=www.example.fr`);
    expect(result).toEqual({
      type: 'scanned',
      response: {
        scan: { grade: 'F', score: 0, tests_passed: 5, tests_failed: 5, tests_quantity: 10 },
        tests: { cookies: { pass: null, result: 'cookies-not-found', score_modifier: 0 } },
      },
    });
  });

  it('should tell apart an host that cannot be scanned from the service refusing', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid-hostname-lookup', message: 'cannot be resolved' }), { status: 422 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }));

    expect(await fetchObservatoryResult('unknown.example.fr')).toEqual({ type: 'unscannable', error: 'cannot be resolved' });
    expect(await fetchObservatoryResult('www.example.fr')).toEqual({ type: 'unavailable', error: 'status 429' });
  });
});
