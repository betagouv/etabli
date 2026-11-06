/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';

import { SovereigntySignals, classifyForeignDependencies, cleanNetworkName, findExternalHosts } from '@etabli/src/utils/foreign-dependencies';

const noSignals: SovereigntySignals = { network: null, cnames: [], mailHosts: [], thirdPartyHosts: [] };

describe('classifyForeignDependencies()', () => {
  it('should have no level when nothing could be observed', () => {
    expect(classifyForeignDependencies(noSignals)).toEqual({ level: null, dependencies: [] });
  });

  it('should find nothing for a european host', () => {
    const network = { asn: 16276, name: 'OVH', country: 'FR' };

    expect(classifyForeignDependencies({ ...noSignals, network: network })).toEqual({ level: 0, dependencies: [] });
  });

  it('should consider the nationality of the provider and not where the network is declared', () => {
    const network = { asn: 16509, name: 'AMAZON-02', country: 'FR' };

    expect(classifyForeignDependencies({ ...noSignals, network: network })).toEqual({ level: 3, dependencies: ['Hébergement : Amazon'] });
  });

  it('should fall back on the country of an unknown network', () => {
    const network = { asn: 1234, name: 'SOME-HOST', country: 'US' };

    expect(classifyForeignDependencies({ ...noSignals, network: network }).level).toBe(3);
    expect(classifyForeignDependencies({ ...noSignals, network: { ...network, country: 'DE' } }).level).toBe(0);
  });

  it('should not consider a CDN as the hosting', () => {
    const network = { asn: 13335, name: 'CLOUDFLARENET', country: 'US' };

    expect(classifyForeignDependencies({ ...noSignals, network: network })).toEqual({ level: 2, dependencies: ['CDN : Cloudflare'] });
  });

  it('should not consider a protection service as the hosting', () => {
    const network = { asn: 19551, name: 'INCAPSULA - Incapsula Inc', country: 'US' };

    expect(classifyForeignDependencies({ ...noSignals, network: network }).level).toBe(2);
  });

  it('should grade emails and third parties below hosting', () => {
    const network = { asn: 16276, name: 'OVH', country: 'FR' };

    expect(
      classifyForeignDependencies({
        network: network,
        cnames: [],
        mailHosts: ['ville-fr.mail.protection.outlook.com'],
        thirdPartyHosts: ['fonts.googleapis.com', 'www.googletagmanager.com', 'cdn.mairie.fr'],
      })
    ).toEqual({ level: 2, dependencies: ['Messagerie : Microsoft', 'Services tiers : Google'] });

    expect(classifyForeignDependencies({ ...noSignals, network: network, thirdPartyHosts: ['cdn.jsdelivr.net'] }).level).toBe(1);
  });

  it('should consider fonts and captchas as services seeing visitors', () => {
    expect(classifyForeignDependencies({ ...noSignals, thirdPartyHosts: ['fonts.googleapis.com'] }).level).toBe(2);
    expect(classifyForeignDependencies({ ...noSignals, thirdPartyHosts: ['www.recaptcha.net'] }).level).toBe(2);
  });

  it('should not consider french overseas networks as foreign', () => {
    expect(classifyForeignDependencies({ ...noSignals, network: { asn: 1, name: 'FR-DOM-GUYANE - Renater', country: 'EU' } }).level).toBe(0);
    expect(classifyForeignDependencies({ ...noSignals, network: { asn: 1, name: 'SOME', country: 'RE' } }).level).toBe(0);
  });

  it('should grade a close country below the others', () => {
    const network = { asn: 1, name: 'Infomaniak-AS Infomaniak Network SA', country: 'CH' };

    expect(classifyForeignDependencies({ ...noSignals, network: network })).toEqual({ level: 2, dependencies: ['Hébergement : Infomaniak Network'] });
  });

  it('should not match a host only ending with the same letters', () => {
    expect(classifyForeignDependencies({ ...noSignals, thirdPartyHosts: ['notgoogle.com'] }).level).toBe(0);
  });
});

describe('cleanNetworkName()', () => {
  it('should keep a readable name', () => {
    expect(cleanNetworkName('radware Radware Ltd')).toBe('Radware');
    expect(cleanNetworkName('CLOUDFLARENET - Cloudflare, Inc.')).toBe('Cloudflare');
    expect(cleanNetworkName('AS12876 Scaleway SAS')).toBe('Scaleway');
    expect(cleanNetworkName(null)).toBeNull();
  });
});

describe('findExternalHosts()', () => {
  it('should only keep what is loaded from elsewhere', () => {
    const dom = new JSDOM(`
      <link rel="stylesheet" href="https://fonts.googleapis.com/css">
      <link rel="canonical" href="https://other.example.fr/">
      <script src="/local.js"></script>
      <script src="https://www.example.fr/same.js"></script>
      <script src="//cdn.jsdelivr.net/lib.js"></script>
      <iframe src="https://www.youtube.com/embed/1"></iframe>
      <a href="https://linked.example.fr/">Link</a>
    `);

    expect(findExternalHosts(dom.window.document, 'www.example.fr')).toEqual(['cdn.jsdelivr.net', 'fonts.googleapis.com', 'www.youtube.com']);
  });
});
