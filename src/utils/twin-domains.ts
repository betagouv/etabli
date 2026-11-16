// A website served on both `example.com` and `www.example.com` (no redirection between them) is a single website, the domains matching
// already linked them as similar since their content is the same, so only one address is analyzed and shown on the initiative
export interface TwinDomainCandidate {
  id: string;
  name: string;
  mainSimilarDomainId: string | null;
  websiteRawContent: string | null;
}

const canonicalPatterns = [
  /<link\b[^>]*\brel=["']?canonical["']?[^>]*\bhref=["']?https?:\/\/([^/"'\s>:]+)/i,
  /<link\b[^>]*\bhref=["']?https?:\/\/([^/"'\s>:]+)[^>]*\brel=["']?canonical["']?/i,
  /<meta\b[^>]*\bproperty=["']?og:url["']?[^>]*\bcontent=["']?https?:\/\/([^/"'\s>:]+)/i,
  /<meta\b[^>]*\bcontent=["']?https?:\/\/([^/"'\s>:]+)[^>]*\bproperty=["']?og:url["']?/i,
];

// The address a website declares as its own (`<link rel="canonical">` first, then `og:url`)
export function getDeclaredCanonicalHostname(html: string): string | null {
  for (const pattern of canonicalPatterns) {
    const match = html.match(pattern);

    if (match) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

// Without a declaration from the website, `www.` is kept since most websites declaring one choose it (4 out of 5 over the twins in our sources)
export function getDiscardedTwinDomainsIds(domains: TwinDomainCandidate[]): Set<string> {
  const discardedIds = new Set<string>();
  const domainsByName = new Map(domains.map((domain) => [domain.name, domain]));

  for (const wwwDomain of domains) {
    if (!wwwDomain.name.startsWith('www.')) {
      continue;
    }

    const rootDomain = domainsByName.get(wwwDomain.name.slice('www.'.length));

    // Without the link the content of both differs, they may be different websites
    if (!rootDomain || (wwwDomain.mainSimilarDomainId !== rootDomain.id && rootDomain.mainSimilarDomainId !== wwwDomain.id)) {
      continue;
    }

    const declaredHostnames = [wwwDomain, rootDomain]
      .map((domain) => (domain.websiteRawContent ? getDeclaredCanonicalHostname(domain.websiteRawContent) : null))
      .filter((hostname) => hostname === wwwDomain.name || hostname === rootDomain.name);

    discardedIds.add(declaredHostnames[0] === rootDomain.name ? wwwDomain.id : rootDomain.id);
  }

  return discardedIds;
}
