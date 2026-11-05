const preferenceCookieMaxAgeInSeconds = 365 * 24 * 60 * 60;

// Display preferences are kept in cookies so the server renders pages with them. They are set by the browser since they change there,
// so they cannot be `HttpOnly` (that is for secrets the scripts must not read, which is not the case of a color scheme)
export function setPreferenceCookie(name: string, value: string): void {
  const attributes = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${preferenceCookieMaxAgeInSeconds}`,
    'SameSite=Lax', // Sent when coming from a link of another website, so the first page already has the preferences
  ];

  // Only sent over HTTPS when the website uses it (local development is served over HTTP)
  if (window.location.protocol === 'https:') {
    attributes.push('Secure');
  }

  document.cookie = attributes.join('; ');
}
