/**
 * @jest-environment node
 */
import { BlockingCircuitBreaker, HostCircuitBreaker, getGitErrorSignature } from '@etabli/src/utils/circuit-breaker';

describe('BlockingCircuitBreaker', () => {
  it('should wait for a full window before concluding', () => {
    const breaker = new BlockingCircuitBreaker(4, 0.5);

    breaker.record(true);
    breaker.record(true);
    breaker.record(true);

    expect(breaker.isOpen()).toBe(false);

    breaker.record(true);

    expect(breaker.isOpen()).toBe(true);
  });

  it('should only look at the latest results', () => {
    const breaker = new BlockingCircuitBreaker(4, 0.75);

    [true, true, true, true].forEach((isBlocked) => breaker.record(isBlocked));
    [false, false].forEach((isBlocked) => breaker.record(isBlocked));

    expect(breaker.isOpen()).toBe(false);
  });
});

const tlsError = (repository: string) =>
  `Cloning into '.'...\nfatal: unable to access 'https://gitlab.example.org/${repository}/': GnuTLS, handshake failed: The TLS connection was non-properly terminated.\n`;

describe('getGitErrorSignature()', () => {
  it('should not depend on the repository', () => {
    expect(getGitErrorSignature(tlsError('a/b'))).toBe(getGitErrorSignature(tlsError('c/d')));
    expect(getGitErrorSignature(tlsError('a/b'))).toBe(
      'fatal: unable to access <url>: GnuTLS, handshake failed: The TLS connection was non-properly terminated.'
    );
  });
});

describe('HostCircuitBreaker', () => {
  it('should give up a host failing with the same error', () => {
    const breaker = new HostCircuitBreaker(5, 0.8);

    expect(breaker.record('gitlab.example.org', null)).toBe(false);
    for (let index = 0; index < 3; index++) {
      expect(breaker.record('gitlab.example.org', tlsError(`group/project-${index}`))).toBe(false);
    }
    expect(breaker.shouldSkip('gitlab.example.org')).toBe(false);

    expect(breaker.record('gitlab.example.org', tlsError('group/project-3'))).toBe(true);
    expect(breaker.shouldSkip('gitlab.example.org')).toBe(true);
    expect(breaker.shouldSkip('gitlab.example.org')).toBe(true);
    expect(breaker.shouldSkip('github.com')).toBe(false);

    expect(breaker.getGivenUpHosts()).toEqual([
      {
        host: 'gitlab.example.org',
        error: getGitErrorSignature(tlsError('a/b')),
        skipped: 2,
      },
    ]);
  });

  it('should keep a host whose failures differ or are specific to repositories', () => {
    const breaker = new HostCircuitBreaker(4, 0.75);

    breaker.record('gitlab.example.org', tlsError('a/b'));
    breaker.record('gitlab.example.org', "fatal: unable to access 'https://gitlab.example.org/c/d/': The requested URL returned error: 503");
    breaker.record(
      'gitlab.example.org',
      "remote: The project you were looking for could not be found.\nfatal: repository 'https://gitlab.example.org/e/f/' not found"
    );
    breaker.record('gitlab.example.org', tlsError('g/h'));

    expect(breaker.shouldSkip('gitlab.example.org')).toBe(false);

    for (const repository of ['i/j', 'k/l', 'm/n']) {
      breaker.record('github.com', `fatal: repository 'https://github.com/${repository}/' not found`);
    }
    breaker.record('github.com', "fatal: could not read Username for 'https://github.com': terminal prompts disabled");

    expect(breaker.shouldSkip('github.com')).toBe(false);
  });
});
