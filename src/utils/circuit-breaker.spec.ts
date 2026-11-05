/**
 * @jest-environment node
 */
import { BlockingCircuitBreaker } from '@etabli/src/utils/circuit-breaker';

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
