/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { getWebsiteVisibleText, slimWebsiteHtml } from '@etabli/src/utils/website-html';

const base64 = 'iVBORw0KGgo'.repeat(40);

describe('slimWebsiteHtml()', () => {
  it('should empty inline scripts and styles but keep their tags and sources', () => {
    const html = slimWebsiteHtml(
      '<html><head><style>body { color: red; }</style><script src="https://cdn.example.com/lib.js"></script><script>var a = 1;</script></head><body><p>Mairie</p></body></html>'
    );

    expect(html).toContain('<script src="https://cdn.example.com/lib.js"></script>');
    expect(html).toContain('<style></style>');
    expect(html).not.toContain('var a = 1');
    expect(html).not.toContain('color: red');
    expect(html).toContain('<p>Mairie</p>');
  });

  it('should not cut the page on a closing tag written inside a script', () => {
    const html = slimWebsiteHtml('<body><script>document.write("<\\/script>"); var b = "</div>";</script><p>Après le script</p></body>');

    expect(html).toContain('<p>Après le script</p>');
    expect(html).not.toContain('document.write');
  });

  it('should keep the content of comments and templates out of the visible text untouched', () => {
    const html = slimWebsiteHtml(
      '<body><!-- <script>var c = 1;</script> --><script type="text/template"><div>Gabarit</div></script><p>Texte</p></body>'
    );

    expect(html).toContain('<!-- <script>var c = 1;</script> -->');
    expect(html).not.toContain('Gabarit');
    expect(html).toContain('<p>Texte</p>');
  });

  it('should empty drawings and replace embedded files', () => {
    const html = slimWebsiteHtml(
      `<body><svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg><img src="data:image/png;base64,${base64}" alt="Logo"><img src="/logo.png" alt="Petit"><p style="background: url(data:image/png;base64,${base64})">Texte</p></body>`
    );

    expect(html).toContain('<svg viewBox="0 0 10 10"></svg>');
    expect(html).toContain('<img src="data:," alt="Logo">');
    expect(html).toContain('<img src="/logo.png" alt="Petit">');
    expect(html).toContain('style="background: url(data:,)"');
    expect(html).not.toContain(base64);
  });

  it('should keep the visible text and the links', () => {
    const html = slimWebsiteHtml('<body><nav><a href="/mentions-legales">Mentions légales</a></nav><h1>Commune de Bours</h1></body>');

    expect(html).toContain('<a href="/mentions-legales">Mentions légales</a>');
    expect(html).toContain('<h1>Commune de Bours</h1>');
  });

  it('should give the same result when run twice', () => {
    const once = slimWebsiteHtml('<html><head><script>var d = 1;</script></head><body><svg><circle/></svg><p>Texte</p></body></html>');

    expect(slimWebsiteHtml(once)).toBe(once);
  });
});

describe('getWebsiteVisibleText()', () => {
  it('should ignore what changes on each load without being displayed', () => {
    const before = getWebsiteVisibleText(
      '<html><body><form><input type="hidden" name="csrf" value="aaa"></form><script>var nonce = "1";</script><p>Mairie\n  de   Paris</p></body></html>'
    );
    const after = getWebsiteVisibleText(
      '<html><body><form><input type="hidden" name="csrf" value="bbb"></form><script>var nonce = "2";</script><p>Mairie de Paris</p></body></html>'
    );

    expect(before).toBe('Mairie de Paris');
    expect(after).toBe(before);
  });
});
