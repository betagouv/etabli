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

// Same idea per forge for the repositories: a forge that bans our IP (often a VPN exit) or that is down fails every clone with the same message,
// so once most of its latest clones failed identically the rest of its repositories are skipped for the run instead of failing one by one
// (they stay queued, whereas a failed attempt would postpone them for days)
// Note: errors specific to a repository (deleted, private...) prove the forge answers, so they count like a success
export class HostCircuitBreaker {
  protected readonly lastErrorsPerHost = new Map<string, (string | null)[]>();
  protected readonly givenUpHosts = new Map<string, { error: string; skipped: number }>();

  public constructor(
    protected readonly windowSize: number,
    protected readonly minimumSameErrorShare: number
  ) {}

  // Returns true when this result makes the run give up on the host
  public record(host: string, error: string | null): boolean {
    if (this.givenUpHosts.has(host)) {
      return false;
    }

    const lastErrors = this.lastErrorsPerHost.get(host) ?? [];

    lastErrors.push(error === null || isRepositorySpecificGitError(error) ? null : getGitErrorSignature(error));

    if (lastErrors.length > this.windowSize) {
      lastErrors.shift();
    }

    this.lastErrorsPerHost.set(host, lastErrors);

    if (lastErrors.length < this.windowSize) {
      return false;
    }

    const occurrencesPerError = new Map<string, number>();
    for (const lastError of lastErrors) {
      if (lastError !== null) {
        occurrencesPerError.set(lastError, (occurrencesPerError.get(lastError) ?? 0) + 1);
      }
    }

    for (const [lastError, occurrences] of occurrencesPerError) {
      if (occurrences / lastErrors.length >= this.minimumSameErrorShare) {
        this.givenUpHosts.set(host, { error: lastError, skipped: 0 });

        return true;
      }
    }

    return false;
  }

  // Counts the skip so the run can sum up what has been left aside
  public shouldSkip(host: string): boolean {
    const givenUpHost = this.givenUpHosts.get(host);

    if (givenUpHost) {
      givenUpHost.skipped++;
    }

    return !!givenUpHost;
  }

  public getGivenUpHosts(): { host: string; error: string; skipped: number }[] {
    return Array.from(this.givenUpHosts, ([host, givenUpHost]) => ({ host, ...givenUpHost }));
  }
}

// Keeps the lines of git explaining the failure without the repository address, so failures of different repositories can be compared
export function getGitErrorSignature(error: string): string {
  const explainingLines = error
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('fatal:') || line.startsWith('error:') || line.startsWith('remote:'));

  return (explainingLines.length > 0 ? explainingLines.join(' ') : error.trim()).replace(/'?(https?|ssh|git):\/\/[^\s']+'?/g, '<url>').slice(0, 300);
}

export function isRepositorySpecificGitError(error: string): boolean {
  return /not found|could not read Username|Authentication failed|terminal prompts disabled|Repository not exported|stopped since over/i.test(error);
}
