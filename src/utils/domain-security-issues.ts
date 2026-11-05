// An issue is a fact a reader can act on, the level only summarizes the most important one. The position in this list is what is stored
export const issueLevels = ['none', 'moderate', 'serious'] as const;
export type IssueLevel = (typeof issueLevels)[number];

const issueLevelLabels: Record<IssueLevel, string> = {
  none: 'Bon',
  moderate: 'Moyen',
  serious: 'À corriger',
};

export function getIssueLevelFilterLabel(level: IssueLevel): string {
  return issueLevelLabels[level];
}

export function getIssueLevelLabel(level: number | null): string | null {
  return level === null ? null : issueLevelLabels[issueLevels[level]] ?? null;
}

export function issueLevelToNumber(level: IssueLevel): number {
  return issueLevels.indexOf(level);
}

const tlsIssueDefinitions = {
  certificate_expired: { label: 'Certificat expiré', serious: true },
  certificate_name_mismatch: { label: 'Certificat établi pour un autre nom', serious: true },
  certificate_untrusted: { label: 'Certificat non reconnu', serious: true },
  legacy_tls: { label: 'Ancienne version de TLS acceptée', serious: false },
} as const;
export type TlsIssue = keyof typeof tlsIssueDefinitions;

const mailIssueDefinitions = {
  spf_invalid: { label: 'SPF mal configuré', serious: true },
  dmarc_invalid: { label: 'DMARC mal configuré', serious: true },
  spf_missing: { label: 'SPF absent', serious: false },
  dmarc_missing: { label: 'DMARC absent', serious: false },
  dmarc_monitoring_only: { label: 'DMARC sans blocage des mails usurpés', serious: false },
} as const;
export type MailIssue = keyof typeof mailIssueDefinitions;

const issueDefinitions: Record<string, { label: string; serious: boolean }> = { ...tlsIssueDefinitions, ...mailIssueDefinitions };

export function getIssueLabels(issues: string[]): string[] {
  return issues.map((issue) => issueDefinitions[issue]?.label ?? issue);
}

function getIssuesLevel(issues: string[]): number {
  if (issues.length === 0) {
    return issueLevelToNumber('none');
  }

  return issueLevelToNumber(issues.some((issue) => issueDefinitions[issue]?.serious) ? 'serious' : 'moderate');
}

export interface TlsSignals {
  authorizationError: string | null;
  expiresAt: Date | null;
  acceptsTls10: boolean | null;
  acceptsTls11: boolean | null;
}

export function classifyTlsIssues(signals: TlsSignals, now: Date = new Date()): { issues: TlsIssue[]; level: number } {
  const issues: TlsIssue[] = [];
  const isExpired = signals.authorizationError === 'CERT_HAS_EXPIRED' || (!!signals.expiresAt && signals.expiresAt < now);

  if (isExpired) {
    issues.push('certificate_expired');
  }

  if (signals.authorizationError === 'ERR_TLS_CERT_ALTNAME_INVALID') {
    issues.push('certificate_name_mismatch');
  } else if (signals.authorizationError && signals.authorizationError !== 'CERT_HAS_EXPIRED') {
    issues.push('certificate_untrusted'); // Self-signed, incomplete chain, unknown authority...
  }

  if (signals.acceptsTls10 || signals.acceptsTls11) {
    issues.push('legacy_tls');
  }

  return { issues: issues, level: getIssuesLevel(issues) };
}

export interface MailSignals {
  hasMx: boolean;
  txtRecords: string[]; // Of the root domain
  dmarcTxtRecords: string[]; // Of `_dmarc` on the root domain
}

const normalizeRecord = (record: string) => record.trim().toLowerCase().replace(/\s+/g, ' ');

// Only the last mechanism tells what to do with unlisted servers. Without qualifier it means `+`, so accepting anyone
function getSpfAllMechanism(record: string): string | null {
  return record.split(' ').find((term) => /^[+\-~?]?all$/.test(term)) ?? null;
}

// A domain not sending anything is not at fault when it publishes nothing, whereas it can't be told apart from a sender if it has
// a SPF record listing servers. `v=spf1 -all` alone is precisely how to declare no email is ever sent
export function classifyMailSecurity(signals: MailSignals): { usesMail: boolean; issues: MailIssue[]; level: number } {
  const spfRecords = signals.txtRecords.map(normalizeRecord).filter((record) => /^v=spf1( |$)/.test(record));
  const dmarcRecords = signals.dmarcTxtRecords.map(normalizeRecord).filter((record) => /^v=dmarc1\s*(;|$)/.test(record));
  const isDeclaredAsNotSending = spfRecords.length === 1 && spfRecords[0] === 'v=spf1 -all';
  const usesMail = signals.hasMx || (spfRecords.length > 0 && !isDeclaredAsNotSending);

  if (!usesMail) {
    return { usesMail: false, issues: [], level: issueLevelToNumber('none') };
  }

  const issues: MailIssue[] = [];

  if (spfRecords.length === 0) {
    issues.push('spf_missing');
  } else if (spfRecords.length > 1 || ['all', '+all'].includes(getSpfAllMechanism(spfRecords[0]) ?? '')) {
    issues.push('spf_invalid'); // Several records make the check fail, and `+all` allows any server of the world
  }

  if (dmarcRecords.length === 0) {
    issues.push('dmarc_missing');
  } else {
    const policy = dmarcRecords[0]
      .split(';')
      .map((tag) => tag.trim())
      .find((tag) => tag.replace(/\s/g, '').startsWith('p='))
      ?.split('=')[1]
      ?.trim();

    if (dmarcRecords.length > 1 || !policy || !['none', 'quarantine', 'reject'].includes(policy)) {
      issues.push('dmarc_invalid');
    } else if (policy === 'none') {
      issues.push('dmarc_monitoring_only');
    }
  }

  return { usesMail: true, issues: issues, level: getIssuesLevel(issues) };
}
