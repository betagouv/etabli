const maximumSlugLength = 80;
const maximumDescriptionLength = 155; // Beyond that search engines cut it anyway

// Like Stack Overflow the name in the address is only for readers and search engines, the identifier alone finds the sheet
export function slugifyInitiativeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, maximumSlugLength)
    .replace(/-+$/, '');
}

export function withInitiativeSlug(initiativeLink: string, name: string): string {
  const slug = slugifyInitiativeName(name);

  return slug !== '' ? `${initiativeLink}/${slug}` : initiativeLink;
}

export function getInitiativePathname(initiativeId: string, name: string): string {
  return withInitiativeSlug(`/initiative/${initiativeId}`, name);
}

export function formatInitiativeMetaDescription(description: string): string {
  const text = description.replace(/\s+/g, ' ').trim();

  if (text.length <= maximumDescriptionLength) {
    return text;
  }

  const cut = text.slice(0, maximumDescriptionLength - 1);
  const lastSpace = cut.lastIndexOf(' ');

  return `${(lastSpace > maximumDescriptionLength / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

// A single organization tells who runs it, with several of them or none the name alone stays readable
export function formatInitiativePageTitle(name: string, organizationsNames: string[]): string {
  if (organizationsNames.length === 1 && organizationsNames[0].trim().toLowerCase() !== name.trim().toLowerCase()) {
    return `${name} (${organizationsNames[0]})`;
  }

  return name;
}
