// Only State administrations can register a `.gouv.fr` domain,
// so a website under it cannot be a domain bought back for private business
const stateReservedDomainSuffixes = ['.gouv.fr'];

export function isStateReservedDomain(domain: string): boolean {
  const normalizedDomain = domain.toLowerCase().replace(/\.$/, '');

  return stateReservedDomainSuffixes.some((suffix) => normalizedDomain === suffix.slice(1) || normalizedDomain.endsWith(suffix));
}
