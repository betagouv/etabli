import { LinkRegistry } from '@etabli/src/utils/routes/registry';

describe('routes', () => {
  const baseUrl = 'http://localhost:3000';
  let linkRegistry: LinkRegistry;

  beforeAll(async () => {
    linkRegistry = new LinkRegistry({ defaultLang: 'en', baseUrl: baseUrl });
  });

  it('should get default language link', async () => {
    const link = linkRegistry.get('initiative', { initiativeId: 'hello' });
    expect(link).toBe('/initiative/hello');
  });

  it('should get overridden language link', async () => {
    const link = linkRegistry.get('initiative', { initiativeId: 'hello' }, { lang: 'en' });
    expect(link).toBe('/initiative/hello');
  });

  it('should get an absolute link', async () => {
    const link = linkRegistry.get('initiative', { initiativeId: 'hello' }, { absolute: true });
    expect(link).toBe('http://localhost:3000/initiative/hello');
  });
});
