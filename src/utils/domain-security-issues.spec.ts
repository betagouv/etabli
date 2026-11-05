/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { classifyMailSecurity, classifyTlsIssues, getIssueLabels, getIssueLevelLabel } from '@etabli/src/utils/domain-security-issues';

const now = new Date('2026-11-09T00:00:00.000Z');
const validTls = { authorizationError: null, expiresAt: new Date('2027-01-01T00:00:00.000Z'), acceptsTls10: false, acceptsTls11: false };

describe('classifyTlsIssues()', () => {
  it('should find nothing on a valid website', () => {
    expect(classifyTlsIssues(validTls, now)).toEqual({ issues: [], level: 0 });
  });

  it('should consider a certificate problem as serious', () => {
    expect(classifyTlsIssues({ ...validTls, authorizationError: 'CERT_HAS_EXPIRED' }, now)).toEqual({ issues: ['certificate_expired'], level: 2 });
    expect(classifyTlsIssues({ ...validTls, authorizationError: 'ERR_TLS_CERT_ALTNAME_INVALID' }, now).issues).toEqual(['certificate_name_mismatch']);
    expect(classifyTlsIssues({ ...validTls, authorizationError: 'DEPTH_ZERO_SELF_SIGNED_CERT' }, now).issues).toEqual(['certificate_untrusted']);
  });

  it('should rely on the expiration date too', () => {
    expect(classifyTlsIssues({ ...validTls, expiresAt: new Date('2026-06-11T00:00:00.000Z') }, now).issues).toEqual(['certificate_expired']);
  });

  it('should consider old protocols as moderate', () => {
    expect(classifyTlsIssues({ ...validTls, acceptsTls11: true }, now)).toEqual({ issues: ['legacy_tls'], level: 1 });
  });

  it('should not report old protocols when it could not be tested', () => {
    expect(classifyTlsIssues({ ...validTls, acceptsTls10: null, acceptsTls11: null }, now).issues).toEqual([]);
  });
});

describe('classifyMailSecurity()', () => {
  const spf = 'v=spf1 include:_spf.example.fr -all';
  const dmarc = 'v=DMARC1; p=reject; rua=mailto:dmarc@example.fr';

  it('should not blame a domain without any email', () => {
    expect(classifyMailSecurity({ hasMx: false, txtRecords: ['google-site-verification=abc'], dmarcTxtRecords: [] })).toEqual({
      usesMail: false,
      issues: [],
      level: 0,
    });
  });

  it('should not blame a domain declaring that it sends nothing', () => {
    expect(classifyMailSecurity({ hasMx: false, txtRecords: ['v=spf1 -all'], dmarcTxtRecords: [] }).usesMail).toBe(false);
  });

  it('should find nothing when protections are set', () => {
    expect(classifyMailSecurity({ hasMx: true, txtRecords: [spf], dmarcTxtRecords: [dmarc] })).toEqual({ usesMail: true, issues: [], level: 0 });
  });

  it('should consider missing protections as moderate', () => {
    expect(classifyMailSecurity({ hasMx: true, txtRecords: [], dmarcTxtRecords: [] })).toEqual({
      usesMail: true,
      issues: ['spf_missing', 'dmarc_missing'],
      level: 1,
    });
  });

  it('should consider a domain with only a SPF record as sending emails', () => {
    expect(classifyMailSecurity({ hasMx: false, txtRecords: [spf], dmarcTxtRecords: [] }).issues).toEqual(['dmarc_missing']);
  });

  it('should tell a DMARC policy that blocks nothing', () => {
    expect(classifyMailSecurity({ hasMx: true, txtRecords: [spf], dmarcTxtRecords: ['v=DMARC1; p=none'] })).toEqual({
      usesMail: true,
      issues: ['dmarc_monitoring_only'],
      level: 1,
    });
  });

  it('should consider a misconfiguration as serious', () => {
    expect(classifyMailSecurity({ hasMx: true, txtRecords: [spf, 'v=spf1 -all'], dmarcTxtRecords: [dmarc] }).issues).toEqual(['spf_invalid']);
    expect(classifyMailSecurity({ hasMx: true, txtRecords: ['v=spf1 +all'], dmarcTxtRecords: [dmarc] })).toEqual({
      usesMail: true,
      issues: ['spf_invalid'],
      level: 2,
    });
    expect(classifyMailSecurity({ hasMx: true, txtRecords: ['v=spf1 mx all'], dmarcTxtRecords: [dmarc] }).issues).toEqual(['spf_invalid']);
    expect(classifyMailSecurity({ hasMx: true, txtRecords: [spf], dmarcTxtRecords: ['v=DMARC1; p=maybe'] }).issues).toEqual(['dmarc_invalid']);
    expect(classifyMailSecurity({ hasMx: true, txtRecords: [spf], dmarcTxtRecords: ['v=DMARC1; rua=mailto:a@b.fr'] }).issues).toEqual([
      'dmarc_invalid',
    ]);
  });
});

describe('labels', () => {
  it('should be readable', () => {
    expect(getIssueLevelLabel(2)).toBe('À corriger');
    expect(getIssueLevelLabel(null)).toBeNull();
    expect(getIssueLabels(['dmarc_missing', 'unknown_one'])).toEqual(['DMARC absent', 'unknown_one']);
  });
});
