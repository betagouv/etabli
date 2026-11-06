/**
 * @jest-environment node
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { fetchSslLabsResult } from '@etabli/src/features/domain-tls-security';

describe('fetchSslLabsResult()', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should wait for the assessment and keep the worst grade of all servers', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'DNS' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'IN_PROGRESS' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'READY',
            endpoints: [
              { ipAddress: '1.1.1.1', grade: 'A+' },
              { ipAddress: '2.2.2.2', grade: 'B' },
            ],
          })
        )
      );

    const result = await fetchSslLabsResult('www.example.fr', 'someone@example.fr', { pollingDelayInMilliseconds: 0 });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect((fetchSpy.mock.calls[0][1]?.headers as Record<string, string>).email).toBe('someone@example.fr');
    expect(result).toEqual({
      type: 'graded',
      grade: 'B',
      endpoints: [
        { ipAddress: '1.1.1.1', grade: 'A+' },
        { ipAddress: '2.2.2.2', grade: 'B' },
      ],
      error: null,
    });
  });

  it('should tell apart a site without TLS from the service refusing', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ERROR', statusMessage: 'Unable to connect to the server' })))
      .mockResolvedValueOnce(new Response('', { status: 429 }));

    expect(await fetchSslLabsResult('www.example.fr', 'someone@example.fr')).toEqual({
      type: 'graded',
      grade: null,
      endpoints: [],
      error: 'Unable to connect to the server',
    });
    expect(await fetchSslLabsResult('www.example.fr', 'someone@example.fr')).toEqual({ type: 'unavailable', error: 'status 429' });
  });
});
