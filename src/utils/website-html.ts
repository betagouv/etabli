import { JSDOM, VirtualConsole } from 'jsdom';

const minimumEmbeddedFileLength = 200;
const embeddedFilePattern = /data:[^;,\s"')]+;base64,[A-Za-z0-9+/=]+/g;

// Inline scripts, styles, drawings and embedded files make most of the size of a stored page whereas nothing reads them: the markdown
// given to the LLM drops them, and dependencies only look at the `src`/`href` of tags. So tags and attributes are kept, only their bulk goes
export function slimWebsiteDocument(document: Document): void {
  document.querySelectorAll('script, style').forEach((element) => {
    element.textContent = '';
  });

  document.querySelectorAll('svg').forEach((element) => {
    element.innerHTML = '';
  });

  document.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.value.length >= minimumEmbeddedFileLength && attribute.value.includes(';base64,')) {
        element.setAttribute(attribute.name, attribute.value.replace(embeddedFilePattern, 'data:,'));
      }
    }
  });
}

export function slimWebsiteHtml(html: string): string {
  const virtualConsole = new VirtualConsole(); // Parsing errors of broken pages do not matter here
  const dom = new JSDOM(html, { contentType: 'text/html', virtualConsole: virtualConsole });

  try {
    slimWebsiteDocument(dom.window.document);

    return dom.serialize();
  } finally {
    dom.window.close();
  }
}

// What a reader sees of the page. Comparing whole pages flagged nearly every check as a change (security tokens, nonces,
// cache-busting parameters, scripts), whereas only the text tells if what the website presents has changed
export function getDocumentVisibleText(document: Document): string {
  if (!document.body) {
    return '';
  }

  const body = document.body.cloneNode(true) as HTMLElement;

  body.querySelectorAll('script, style, noscript, template').forEach((element) => {
    element.remove();
  });

  return (body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function getWebsiteVisibleText(html: string): string {
  const virtualConsole = new VirtualConsole(); // Parsing errors of broken pages do not matter here
  const dom = new JSDOM(html, { contentType: 'text/html', virtualConsole: virtualConsole });

  try {
    return getDocumentVisibleText(dom.window.document);
  } finally {
    dom.window.close();
  }
}
