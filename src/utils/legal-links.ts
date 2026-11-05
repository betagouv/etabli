// The logic comes from Sipres: looking at the text of links and at the parts of their URL, each part separately so the end of one
// and the beginning of the next one cannot make a false match. The fuzzy search has not been kept because it was matching
// words like "galerie" for "legal", which is fine to widen a search of legal identifiers but not to tell if a page exists
const legalNoticePatterns = ['mentions legales', 'mention legale', 'notice legale', 'informations legales', 'legal notice', 'legal mentions'];
const privacyPolicyPatterns = ['confidentialite', 'donnees personnelles', 'protection des donnees', 'vie privee', 'privacy', 'rgpd', 'gdpr'];

// A part exactly equal to these is enough, whereas it would be too generic as a word of a sentence
const legalNoticeExactParts = ['legal', 'legales', 'mentions', 'imprint'];

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Accents
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, '') // File extension of a URL part
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface LegalLinks {
  hasLegalNotice: boolean;
  hasPrivacyPolicy: boolean;
}

export function detectLegalLinks(links: { text: string; href: string }[]): LegalLinks {
  const result: LegalLinks = { hasLegalNotice: false, hasPrivacyPolicy: false };

  for (const link of links) {
    let urlParts: string[] = [];

    try {
      const url = new URL(link.href, 'https://localhost');

      urlParts = [...url.pathname.split('/'), url.search, url.hash];
    } catch (error) {
      // An invalid link can still have a meaningful text
    }

    const parts = [link.text, ...urlParts].map(normalize).filter(Boolean);

    result.hasLegalNotice ||= parts.some(
      (part) => legalNoticePatterns.some((pattern) => part.includes(pattern)) || legalNoticeExactParts.includes(part)
    );
    result.hasPrivacyPolicy ||= parts.some((part) => privacyPolicyPatterns.some((pattern) => part.includes(pattern)));

    if (result.hasLegalNotice && result.hasPrivacyPolicy) {
      break;
    }
  }

  return result;
}

export function detectLegalLinksFromDocument(document: Document): LegalLinks {
  return detectLegalLinks(
    Array.from(document.querySelectorAll('a')).map((link) => ({ text: link.textContent ?? '', href: link.getAttribute('href') ?? '' }))
  );
}
