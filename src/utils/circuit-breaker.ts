// Tells when a long crawl should stop because most of what it tries gets refused: it probably means our IP is now blocked
// or the network is down, so going on would keep hitting thousands of websites for nothing
export class BlockingCircuitBreaker {
  protected readonly lastResults: boolean[] = [];

  public constructor(
    protected readonly windowSize: number,
    protected readonly maximumBlockedShare: number
  ) {}

  public record(isBlocked: boolean): void {
    this.lastResults.push(isBlocked);

    if (this.lastResults.length > this.windowSize) {
      this.lastResults.shift();
    }
  }

  public isOpen(): boolean {
    if (this.lastResults.length < this.windowSize) {
      return false;
    }

    return this.lastResults.filter((isBlocked) => isBlocked).length / this.lastResults.length >= this.maximumBlockedShare;
  }
}

// Domains of a same provider are close to each other when sorted, so processing them randomly prevents the failure of a single
// provider from looking like a global blocking, and it also spreads the load over providers
export function shuffle<T>(items: T[]): T[] {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));

    [shuffledItems[index], shuffledItems[randomIndex]] = [shuffledItems[randomIndex], shuffledItems[index]];
  }

  return shuffledItems;
}
