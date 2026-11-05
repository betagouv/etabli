import type { Browser } from 'patchright';
import WappalyzerCore from 'wappalyzer/wappalyzer';

import { detectWebsiteProtection } from '@etabli/src/features/website-protection';

// Some websites refuse the browser driven by Wappalyzer (Puppeteer is easy to spot) whereas they accept the stealth one already used
// for their content. Here the page is opened with the stealth browser and what Wappalyzer reads on a page is collected the same way,
// then given to its own detection engine so results are comparable with the regular inventory.
// Note: the collection is written here, the Wappalyzer driver (GPL-3.0) is not copied, only its engine is used as for the regular inventory

export interface StealthDetectedTechnology {
  name: string;
  version: string | null;
  cpe: string | null;
  confidence: number;
}

export interface StealthWebsiteAnalysis {
  status: number;
  protection: string | null; // When a firewall or an anti-bot challenge answered instead of the website (nothing is solved)
  technologies: StealthDetectedTechnology[];
}

interface CoreTechnology {
  name: string;
  categories: { id: number }[] | number[];
  js: Record<string, unknown>;
  dom: Record<string, { exists?: unknown; text?: unknown; properties?: Record<string, unknown>; attributes?: Record<string, unknown> }[]>;
}

interface PageDomQuery {
  name: string;
  selector: string;
  exists: boolean;
  text: boolean;
  properties: string[];
  attributes: string[];
}

type CollectedJs = { name: string; chain: string; value: string | number | boolean };
type CollectedDom =
  | { name: string; selector: string; exists: true }
  | { name: string; selector: string; text: string }
  | { name: string; selector: string; property: string; value: string | number | boolean }
  | { name: string; selector: string; attribute: string; value: string | number | boolean };

const maximumHtmlLength = 2_000_000;
const maximumCssRules = 3_000;
const maximumDomMatchesPerTechnology = 50;

function getJsQueries(technologies: CoreTechnology[]): { name: string; chains: string[] }[] {
  return technologies
    .filter((technology) => Object.keys(technology.js).length > 0)
    .map((technology) => ({ name: technology.name, chains: Object.keys(technology.js) }));
}

function getDomQueries(technologies: CoreTechnology[]): PageDomQuery[] {
  return technologies.flatMap((technology) =>
    Object.entries(technology.dom || {}).flatMap(([selector, patterns]) =>
      patterns.map((pattern) => ({
        name: technology.name,
        selector: selector,
        exists: pattern.exists !== undefined,
        text: pattern.text !== undefined,
        properties: Object.keys(pattern.properties || {}),
        attributes: Object.keys(pattern.attributes || {}),
      }))
    )
  );
}

// Runs inside the page, so it must stay self-contained
function readPageJs(queries: { name: string; chains: string[] }[]): CollectedJs[] {
  const results: CollectedJs[] = [];

  for (const { name, chains } of queries) {
    for (const chain of chains) {
      try {
        const parts = chain.replace(/\[([^\]]+)\]/g, '.$1').split('.');
        let value: unknown = window;

        for (const part of parts) {
          if (value !== null && (typeof value === 'object' || typeof value === 'function') && Object.prototype.hasOwnProperty.call(value, part)) {
            value = (value as Record<string, unknown>)[part];
          } else {
            value = undefined;
            break;
          }
        }

        if (value !== undefined) {
          results.push({ name, chain, value: typeof value === 'string' || typeof value === 'number' ? value : !!value });
        }
      } catch (error) {
        // A getter of the page can throw, it just means nothing to learn from it
      }
    }
  }

  return results;
}

// Runs inside the page, so it must stay self-contained
function readPageDom(input: { queries: PageDomQuery[]; maximumMatches: number }): CollectedDom[] {
  const results: CollectedDom[] = [];
  const matchesByTechnology = new Map<string, number>();
  const toScalar = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? value : !!value);

  for (const query of input.queries) {
    let nodes: Element[] = [];

    try {
      nodes = Array.from(document.querySelectorAll(query.selector));
    } catch (error) {
      continue; // Selectors written for other engines
    }

    for (const node of nodes) {
      const matches = matchesByTechnology.get(query.name) ?? 0;

      if (matches >= input.maximumMatches) {
        break;
      }

      if (query.exists) {
        results.push({ name: query.name, selector: query.selector, exists: true });
      }
      if (query.text) {
        const text = (node.textContent ?? '').trim().slice(0, 1_000_000);

        if (text) {
          results.push({ name: query.name, selector: query.selector, text });
        }
      }
      for (const property of query.properties) {
        const value = (node as unknown as Record<string, unknown>)[property];

        if (value !== undefined) {
          results.push({ name: query.name, selector: query.selector, property, value: toScalar(value) });
        }
      }
      for (const attribute of query.attributes) {
        if (node.hasAttribute(attribute)) {
          results.push({ name: query.name, selector: query.selector, attribute, value: toScalar(node.getAttribute(attribute)) });
        }
      }

      matchesByTechnology.set(query.name, matches + 1);
    }
  }

  return results;
}

// Runs inside the page, so it must stay self-contained
function readPageItems(maximumCssRules: number) {
  const meta: Record<string, string[]> = {};

  for (const element of Array.from(document.querySelectorAll('meta'))) {
    const key = element.getAttribute('name') || element.getAttribute('property');

    if (key) {
      meta[key.toLowerCase()] = [...(meta[key.toLowerCase()] ?? []), element.getAttribute('content') ?? ''];
    }
  }

  const css: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        css.push(rule.cssText);

        if (css.length >= maximumCssRules) {
          break;
        }
      }
    } catch (error) {
      // Stylesheets of other origins cannot be read
    }

    if (css.length >= maximumCssRules) {
      break;
    }
  }

  return {
    text: document.body ? document.body.innerText.slice(0, 1_000_000) : '',
    css: css.join('\n'),
    scriptSrc: Array.from(document.querySelectorAll('script[src]'))
      .map((script) => script.getAttribute('src') ?? '')
      .filter((src) => src !== '' && !src.startsWith('data:')),
    meta: meta,
  };
}

function detect(technologies: CoreTechnology[], items: Record<string, unknown>, js: CollectedJs[], dom: CollectedDom[]): unknown[] {
  const byName = new Map(technologies.map((technology) => [technology.name, technology]));

  const jsDetections = js.flatMap(({ name, chain, value }) => {
    const technology = byName.get(name);

    return technology ? WappalyzerCore.analyzeManyToMany(technology, 'js', { [chain]: [value] }) : [];
  });

  const domDetections = dom.flatMap((item) => {
    const technology = byName.get(item.name);

    if (!technology) {
      return [];
    } else if ('exists' in item) {
      return WappalyzerCore.analyzeManyToMany(technology, 'dom.exists', { [item.selector]: [''] });
    } else if ('text' in item) {
      return WappalyzerCore.analyzeManyToMany(technology, 'dom.text', { [item.selector]: [item.text] });
    } else if ('property' in item) {
      return WappalyzerCore.analyzeManyToMany(technology, `dom.properties.${item.property}`, { [item.selector]: [item.value] });
    } else {
      return WappalyzerCore.analyzeManyToMany(technology, `dom.attributes.${item.attribute}`, { [item.selector]: [item.value] });
    }
  });

  return [...WappalyzerCore.analyze(items, technologies), ...jsDetections, ...domDetections];
}

export async function analyzeWebsiteWithStealthBrowser(browser: Browser, url: string): Promise<StealthWebsiteAnalysis> {
  // The engine has no fingerprint until they are given to it, every website would silently end up without any technology
  if ((WappalyzerCore.technologies as CoreTechnology[]).length === 0) {
    throw new Error('the wappalyzer fingerprints must be loaded before analyzing a website');
  }

  const page = await browser.newPage({
    // Same signals as a regular browser, like the stealth retrieval of the content
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version().split('.')[0]}.0.0.0 Safari/537.36`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 },
  });

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });

    // Leave time to scripts to declare what Wappalyzer looks for, without waiting forever on websites that never stop loading
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

    const status = response?.status() ?? 0;
    const rawHeaders = response ? await response.allHeaders() : {};
    const html = (await page.content()).slice(0, maximumHtmlLength);
    const title = await page.title().catch(() => null);
    const protection = detectWebsiteProtection({ status, headers: rawHeaders, title, html });

    if (protection || status < 200 || status >= 300) {
      return { status, protection, technologies: [] };
    }

    const headers = Object.fromEntries(Object.entries(rawHeaders).map(([name, value]) => [name.toLowerCase(), value.split('\n')]));
    const cookies: Record<string, string[]> = {};
    for (const cookie of await page.context().cookies()) {
      cookies[cookie.name.toLowerCase()] = [...(cookies[cookie.name.toLowerCase()] ?? []), cookie.value];
    }
    const securityDetails = response ? await response.securityDetails().catch(() => null) : null;

    // Functions given to the page are compiled, and some compilers (`tsx` for the CLI) add a call to this helper that the page does not have
    await page.evaluate('globalThis.__name = globalThis.__name || ((target) => target)');
    const pageItems = await page.evaluate(readPageItems, maximumCssRules);

    const items = {
      url: page.url(),
      html: html,
      text: pageItems.text,
      css: pageItems.css,
      scriptSrc: pageItems.scriptSrc,
      meta: pageItems.meta,
      headers: headers,
      cookies: cookies,
      ...(securityDetails?.issuer ? { certIssuer: securityDetails.issuer } : {}),
    };

    // Technologies requiring another one are only looked for once that one is detected, as Wappalyzer does
    const baseTechnologies = WappalyzerCore.technologies as CoreTechnology[];
    let detections = detect(
      baseTechnologies,
      items,
      await page.evaluate(readPageJs, getJsQueries(baseTechnologies)),
      await page.evaluate(readPageDom, { queries: getDomQueries(baseTechnologies), maximumMatches: maximumDomMatchesPerTechnology })
    );

    const analyzedRequirements = new Set<string>();
    while (true) {
      const resolvedNames = new Set(WappalyzerCore.resolve(detections).map((technology: { name: string }) => technology.name));
      const resolvedCategories = new Set(
        WappalyzerCore.resolve(detections).flatMap((technology: { categories: { id: number }[] }) => technology.categories.map(({ id }) => id))
      );
      const requiredTechnologies: CoreTechnology[] = [
        ...(WappalyzerCore.requires as { name: string; technologies: CoreTechnology[] }[])
          .filter(({ name }) => resolvedNames.has(name) && !analyzedRequirements.has(`name:${name}`))
          .flatMap(({ name, technologies }) => {
            analyzedRequirements.add(`name:${name}`);

            return technologies;
          }),
        ...(WappalyzerCore.categoryRequires as { categoryId: number; technologies: CoreTechnology[] }[])
          .filter(({ categoryId }) => resolvedCategories.has(categoryId) && !analyzedRequirements.has(`category:${categoryId}`))
          .flatMap(({ categoryId, technologies }) => {
            analyzedRequirements.add(`category:${categoryId}`);

            return technologies;
          }),
      ];

      if (requiredTechnologies.length === 0) {
        break;
      }

      detections = [
        ...detections,
        ...detect(
          requiredTechnologies,
          items,
          await page.evaluate(readPageJs, getJsQueries(requiredTechnologies)),
          await page.evaluate(readPageDom, { queries: getDomQueries(requiredTechnologies), maximumMatches: maximumDomMatchesPerTechnology })
        ),
      ];
    }

    const technologies = (WappalyzerCore.resolve(detections) as { name: string; version: string; cpe: string | null; confidence: number }[]).map(
      (technology) => ({
        name: technology.name,
        version: technology.version || null,
        cpe: technology.cpe ?? null,
        confidence: technology.confidence,
      })
    );

    return { status, protection: null, technologies };
  } finally {
    await page.close();
  }
}
