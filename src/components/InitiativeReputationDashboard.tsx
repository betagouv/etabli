'use client';

import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { trpc } from '@etabli/src/client/trpcClient';
import { ReputationChip } from '@etabli/src/components/ReputationChip';
import { DomainReputationSchemaType } from '@etabli/src/models/entities/initiative';
import { getIssueLabels, getIssueLevelLabel } from '@etabli/src/utils/domain-security-issues';
import { getForeignDependencyLevelLabel } from '@etabli/src/utils/foreign-dependencies';
import { serverPrefetchedQueryStaleTime } from '@etabli/src/utils/query';

// Lets the page know there is something to display beside its main content
export const initiativeSecondaryContentAttribute = 'data-initiative-secondary-content';

const secondaryTitleSx = { m: 0, fontSize: { xl: '1.25rem' }, lineHeight: { xl: 1.4 } };

const unavailableValue = 'Valeur non disponible';
const notSignificantValue = 'Non significatif';
const noMailValue = 'Pas de messagerie';
const linkFoundValue = 'Lien trouvé';
const linkNotFoundValue = 'Lien non trouvé';
const numberFormatter = new Intl.NumberFormat('fr-FR');
const dateFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }); // The long months do not fit on a line
const fullDateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }); // Fixed so the server renders the same as browsers
const countryNames = new Intl.DisplayNames(['fr'], { type: 'region' });

const maximumDisplayedCategories = 6;
const undeterminedLabel = 'Non déterminé';

const semanticLocationLabels: Record<string, string> = {
  '': undeterminedLabel,
  nav: 'Menu de navigation',
  footer: 'Pied de page',
  main: 'Contenu principal',
  article: 'Article',
  section: 'Section de page',
  header: 'En-tête',
  aside: 'Encadré',
  details: 'Bloc dépliable',
  figure: 'Illustration',
};

const linkTypeLabels: Record<string, string> = {
  anchor: 'Texte',
  image: 'Image',
  redirect: 'Redirection',
  canonical: 'Page canonique',
  alternate: 'Version alternative',
};

const platformTypeLabels: Record<string, string> = {
  unknown: undeterminedLabel,
  organization: 'Organisation',
  blogs: 'Blog',
  cms: 'Site vitrine (CMS)',
  ecommerce: 'E-commerce',
  news: 'Presse',
  'message-boards': 'Forum',
  wikis: 'Wiki',
};

// The provider gives 0 to websites with too few links to be scored, which does not mean they are worthless
function getScoreLabel(rank: number | null): string {
  if (rank === null) {
    return unavailableValue;
  }

  return rank === 0 ? notSignificantValue : `${rank} %`;
}

function getLegalLinkLabel(value: boolean | null): string {
  if (value === null) {
    return unavailableValue;
  }

  return value ? linkFoundValue : linkNotFoundValue;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatNumber(value: number | null): string {
  return value !== null ? numberFormatter.format(value) : unavailableValue;
}

function getCountryLabel(code: string): string {
  if (code === '') {
    return undeterminedLabel;
  } else if (code === 'WW') {
    return 'Monde';
  }

  try {
    return countryNames.of(code) ?? code;
  } catch (error) {
    return code; // Some values are not valid region codes
  }
}

const panelSx = {
  border: '1px solid var(--border-default-grey)',
  borderRadius: '8px',
  backgroundColor: 'var(--background-default-grey)',
  minWidth: 0,
};

const metricsGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 2,
  m: 0,
  p: 0,
};

function InfoBubble(props: { label: string; description: string; details?: string[] }) {
  const hasDetails = !!props.details && props.details.length > 0;

  return (
    <Tooltip
      title={
        hasDetails ? (
          <>
            {props.description}
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2 }}>
              {props.details?.map((detail) => <li key={detail}>{detail}</li>)}
            </Box>
          </>
        ) : (
          props.description
        )
      }
    >
      <IconButton
        size="small"
        aria-label={`À propos de « ${props.label} » : ${props.description}${hasDetails ? ` ${props.details?.join(' ; ')}.` : ''}`}
        sx={{ p: '0.125rem', flexShrink: 0 }}
      >
        <InfoOutlinedIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );
}

function Metric(props: { label: string; value: string; description: string; details?: string[]; compact?: boolean }) {
  const isUnavailable = props.value === unavailableValue;
  const isEmpty = isUnavailable || props.value === notSignificantValue || props.value === noMailValue;
  const isLink = props.value === linkFoundValue || props.value === linkNotFoundValue;
  const LinkIcon = props.value === linkFoundValue ? CheckIcon : CloseIcon;

  return (
    <Box sx={{ ...panelSx, p: '20px !important' }}>
      <Box component="dt" sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Typography component="span" variant="body2" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {props.label}
        </Typography>
        <InfoBubble
          label={props.label}
          description={isUnavailable ? `${props.description} Valeur non disponible pour ce site.` : props.description}
          details={props.details}
        />
      </Box>
      <Typography
        component="dd"
        sx={{
          m: '0 !important', // The DSFR indents definitions
          pl: '0 !important',
          pt: 1,
          fontWeight: 700,
          fontSize: props.compact ? { xs: '1.5rem', xl: '1.25rem' } : { xs: '1.5rem', md: '2rem' },
          lineHeight: 1.2,
          display: 'flex',
          alignItems: 'center',
          minHeight: '1.2em',
        }}
      >
        {isEmpty || isLink ? (
          <>
            {isLink ? <LinkIcon aria-hidden="true" sx={{ fontSize: 'inherit' }} /> : <span aria-hidden="true">–</span>}
            <span className="fr-sr-only">{props.value}</span>
          </>
        ) : (
          props.value
        )}
      </Typography>
    </Box>
  );
}

function Distribution(props: { title: string; values: Record<string, number> | null; getLabel: (key: string) => string; description: string }) {
  const entries = Object.entries(props.values ?? {}).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const sortedEntries = entries.sort(([, a], [, b]) => b - a);
  const displayedEntries = sortedEntries.slice(0, maximumDisplayedCategories);

  return (
    <Box sx={{ ...panelSx, p: '20px !important' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: '0.75rem' }}>
        <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 700, m: 0 }}>
          {props.title}
        </Typography>
        <InfoBubble label={props.title} description={props.description} />
      </Box>
      {total === 0 ? (
        <Typography variant="body2" sx={{ color: 'var(--text-mention-grey)' }}>
          {unavailableValue}
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {displayedEntries.map(([key, value]) => {
            const share = (value / total) * 100;
            const label = props.getLabel(key);

            return (
              // The row is tall enough for an anchored tooltip to be far from the pointer and to hide the row above. The count is also
              // written for screen readers, the tooltip only showing on hover (`describeChild` keeps the row content as its name)
              <Tooltip
                key={key}
                followCursor
                describeChild
                arrow={false}
                title={`${label} : ${numberFormatter.format(value)} lien${value > 1 ? 's' : ''}`}
              >
                <Box component="li" sx={{ py: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography component="span" variant="body2" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {label}
                    </Typography>
                    <Typography component="span" variant="body2" sx={{ flexShrink: 0, fontWeight: 700 }}>
                      {share < 1 ? '< 1' : Math.round(share)}&nbsp;%
                      <span className="fr-sr-only">{` (${numberFormatter.format(value)} lien${value > 1 ? 's' : ''})`}</span>
                    </Typography>
                  </Box>
                  <Box aria-hidden="true" sx={{ height: 8, mt: '0.375rem', borderRadius: '4px', bgcolor: 'var(--background-contrast-grey)' }}>
                    <Box
                      sx={{
                        height: '100%',
                        width: `${share}%`,
                        minWidth: 4,
                        borderRadius: '4px',
                        bgcolor: 'var(--background-action-high-blue-france)',
                      }}
                    />
                  </Box>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

type MetricProps = Parameters<typeof Metric>[0];

// The ones worth being seen at first, without opening the whole detail
function getKeyMetrics(reputation: DomainReputationSchemaType): Record<string, MetricProps> {
  return {
    score: {
      label: 'Score de notoriété',
      value: getScoreLabel(reputation.rank),
      description: `Calculé sur l'ensemble d'internet à partir des liens externes vers ce site et de leur qualité. Il ne mesure pas la qualité du service.${
        reputation.rank === 0 ? ' Il y a ici trop peu de liens pour obtenir un score.' : ''
      }`,
    },
    mainDomains: {
      label: 'Domaines externes',
      value: formatNumber(reputation.referringMainDomains),
      description:
        "Nombre d'acteurs externes différents faisant un lien vers ce site : blog.exemple.fr et www.exemple.fr ne comptent que pour un seul exemple.fr.",
    },
    httpSecurity: {
      label: 'En-têtes de sécurité HTTP',
      value: reputation.httpSecurityGrade ?? unavailableValue,
      description:
        'Note de A+ à F donnée par Mozilla HTTP Observatory aux protections que le site déclare au navigateur (en-têtes de sécurité, cookies). Elle ne couvre pas tous les aspects de la sécurité du site.',
    },
    tls: {
      label: 'Certificat et TLS',
      value: getIssueLevelLabel(reputation.tlsLevel) ?? unavailableValue,
      description:
        'Validité du certificat du site et refus des anciennes versions de TLS. Les problèmes de certificat sont à corriger, une ancienne version acceptée est à améliorer.',
      details: getIssueLabels(reputation.tlsIssues),
    },
    mail: {
      label: 'Protection des e-mails',
      value: reputation.usesMail === false ? noMailValue : getIssueLevelLabel(reputation.mailSecurityLevel) ?? unavailableValue,
      description: `Protections SPF et DMARC du domaine, qui empêchent d'envoyer de faux e-mails en son nom. Elles ne sont attendues que si le domaine sert à la messagerie.${
        reputation.usesMail === false ? " Ce n'est pas le cas ici." : ''
      }`,
      details: getIssueLabels(reputation.mailIssues),
    },
    foreignDependency: {
      label: 'Dépendance hors UE',
      value: getForeignDependencyLevelLabel(reputation.foreignDependencyLevel) ?? unavailableValue,
      description:
        "Ce qui se voit de l'extérieur du site, selon la nationalité des prestataires : hébergement, CDN, messagerie, services et bibliothèques tiers. Les services appelés par ses serveurs ne sont pas visibles.",
      details: reputation.foreignDependencies,
    },
    legalNotice: {
      label: 'Mentions légales',
      value: getLegalLinkLabel(reputation.hasLegalNotice),
      description: "Présence d'un lien vers les mentions légales sur la page d'accueil. Le contenu de la page n'est pas vérifié.",
    },
    privacyPolicy: {
      label: 'Confidentialité',
      value: getLegalLinkLabel(reputation.hasPrivacyPolicy),
      description:
        "Présence d'un lien vers la politique de confidentialité sur la page d'accueil. Elle peut aussi se trouver sur une autre page, et son contenu n'est pas vérifié.",
    },
  };
}

const summaryGridSx = { ...metricsGridSx, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' };

function DomainReputationSummary({ reputation }: { reputation: DomainReputationSchemaType }) {
  const keyMetrics = getKeyMetrics(reputation);

  return (
    <Box component="section" aria-label={`Résumé pour ${reputation.domain}`}>
      <Typography component="h2" variant="h4" sx={{ ...secondaryTitleSx, mb: 2 }}>
        Notoriété sur internet
      </Typography>
      <Box component="dl" sx={summaryGridSx}>
        <Metric compact {...keyMetrics.score} />
        <Metric compact {...keyMetrics.mainDomains} />
      </Box>
      <Typography component="h2" variant="h4" sx={{ ...secondaryTitleSx, mt: 4, mb: 2 }}>
        Sécurité et conformité
      </Typography>
      <Box component="dl" sx={summaryGridSx}>
        <Metric compact {...keyMetrics.httpSecurity} label="En-têtes HTTP" />
        <Metric compact {...keyMetrics.tls} />
        <Metric compact {...keyMetrics.mail} />
        <Metric compact {...keyMetrics.foreignDependency} />
        <Metric compact {...keyMetrics.legalNotice} />
        <Metric compact {...keyMetrics.privacyPolicy} />
      </Box>
    </Box>
  );
}

function DomainReputation({ reputation }: { reputation: DomainReputationSchemaType }) {
  const keyMetrics = getKeyMetrics(reputation);

  return (
    <Box component="section" aria-label={`Notoriété de ${reputation.domain}`}>
      <Box component="dl" sx={metricsGridSx}>
        <Metric {...keyMetrics.score} />
        <Metric
          label="Sites externes"
          value={formatNumber(reputation.referringDomains)}
          description="Nombre d'autres sites ayant au moins un lien vers ce site. Les sous-domaines sont comptés séparément."
        />
        <Metric {...keyMetrics.mainDomains} />
        <Metric
          label="Adresses IP distinctes"
          value={formatNumber(reputation.referringIps)}
          description="Nombre de serveurs d'où viennent les liens externes. Un chiffre bien plus bas que le nombre de sites externes indique des sources moins indépendantes, ou un hébergeur commun."
        />
        <Metric
          label="Liens externes"
          value={formatNumber(reputation.backlinks)}
          description="Nombre total de liens posés sur d'autres sites vers celui-ci. Un seul site peut en représenter beaucoup, par exemple via un pied de page."
        />
        <Metric
          label="Pages externes"
          value={formatNumber(reputation.referringPages)}
          description="Nombre de pages d'autres sites contenant au moins un lien vers ce site."
        />
        <Metric
          label="Sites en nofollow"
          value={formatNumber(reputation.referringDomainsNofollow)}
          description="Nombre de sites externes dont les liens vers ce site portent l'attribut « nofollow » : ils demandent aux moteurs de recherche de ne pas en tenir compte pour le référencement."
        />
        <Metric
          label="Liens douteux"
          value={reputation.backlinksSpamScore !== null ? `${reputation.backlinksSpamScore} %` : unavailableValue}
          description="Probabilité que les liens externes soient artificiels. Plus le score est bas, mieux c'est."
        />
        <Metric
          label="Liens cassés"
          value={formatNumber(reputation.brokenBacklinks)}
          description="Liens posés sur d'autres sites vers une page de ce site qui n'existe plus."
        />
        <Metric
          label="Pages cassées"
          value={formatNumber(reputation.brokenPages)}
          description="Pages de ce site en erreur alors que d'autres sites font encore un lien vers elles."
        />
        <Metric
          label="Connu depuis"
          value={reputation.firstSeenAt ? capitalize(dateFormatter.format(reputation.firstSeenAt)) : unavailableValue}
          description="Date à laquelle le service tiers a vu pour la première fois un lien externe vers ce site."
        />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, mt: 2 }}>
        <Distribution
          title="Où sont placés les liens externes"
          description="Partie des pages externes où se trouvent les liens : un lien dans le contenu pèse plus qu'un lien répété en pied de page."
          values={reputation.linksSemanticLocations}
          getLabel={(key) => semanticLocationLabels[key] ?? key}
        />
        <Distribution
          title="Nature des liens externes"
          description="Forme des liens : texte cliquable, image, redirection…"
          values={reputation.linksTypes}
          getLabel={(key) => linkTypeLabels[key] ?? key}
        />
        <Distribution
          title="Type de sites à l'origine"
          description="Catégorie des sites qui font un lien, lorsque le service tiers a pu la déterminer."
          values={reputation.linksPlatformTypes}
          getLabel={(key) => platformTypeLabels[key] ?? key}
        />
        <Distribution
          title="Pays à l'origine"
          description="Répartition calculée sur les 10 principaux pays uniquement."
          values={reputation.linksCountries}
          getLabel={getCountryLabel}
        />
        <Distribution
          title="Extensions à l'origine"
          description="Répartition calculée sur les 10 principales extensions uniquement."
          values={reputation.linksTopLevelDomains}
          getLabel={(key) => (key === '' ? undeterminedLabel : `.${key}`)}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 4, mb: 1 }}>
        <Typography component="h2" variant="h4" sx={secondaryTitleSx}>
          Sécurité et conformité
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Ce qui se voit de l&apos;extérieur du site, d&apos;après des analyses automatiques.
      </Typography>
      <Box
        component="dl"
        sx={{
          ...metricsGridSx,
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        <Metric compact {...keyMetrics.httpSecurity} />

        <Metric compact {...keyMetrics.tls} />

        <Metric compact {...keyMetrics.mail} />

        <Metric compact {...keyMetrics.foreignDependency} />

        <Metric compact {...keyMetrics.legalNotice} />

        <Metric compact {...keyMetrics.privacyPolicy} />
      </Box>
    </Box>
  );
}

export interface InitiativeReputationDashboardProps {
  initiativeId: string;
}

// It stays secondary and the score is not compared to other initiatives, since public services are not in competition
export function InitiativeReputationDashboard(props: InitiativeReputationDashboardProps) {
  const { data } = trpc.getInitiativeReputation.useQuery({ id: props.initiativeId }, { staleTime: serverPrefetchedQueryStaleTime });
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!data || data.domains.length === 0) {
    return null;
  }

  // Domains are sorted by reputation, so the best one is displayed by default
  const reputation = data.domains.find(({ domain }) => domain === selectedDomain) ?? data.domains[0];

  const domainSelector = data.domains.length > 1 && (
    <TextField
      select
      size="small"
      label="Site analysé"
      value={reputation.domain}
      onChange={(event) => {
        setSelectedDomain(event.target.value);
      }}
      sx={{ width: '100%', maxWidth: 420, mb: 3 }}
    >
      {data.domains.map(({ domain, relativeReputation }) => (
        <MenuItem key={domain} value={domain}>
          {/* The select repeats the content of the chosen item in its field, so there is no need for a separate render */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, width: '100%' }}>
            <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {domain}
            </Box>
            {!!relativeReputation && <ReputationChip relativeReputation={relativeReputation} sx={{ flexShrink: 0 }} />}
          </Box>
        </MenuItem>
      ))}
    </TextField>
  );

  const details = (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        D&apos;après les liens que les autres sites font vers celui-ci, estimés par un service tiers. Données récupérées le{' '}
        {fullDateFormatter.format(reputation.lastCheckAt)}.
      </Typography>
      {domainSelector}
      <DomainReputation key={reputation.domain} reputation={reputation} />
    </>
  );

  return (
    <Box
      component="aside"
      aria-label="Notoriété, sécurité et conformité"
      {...{ [initiativeSecondaryContentAttribute]: true }}
      sx={{
        gridArea: 'secondary',
        minWidth: 0,
        mt: { xs: 3, xl: 0 },
        alignSelf: { xl: 'start' },
        p: { xl: 3 },
        borderRadius: { xl: '8px' },
        backgroundColor: { xl: 'var(--background-alt-grey)' },
      }}
    >
      {/* Both layouts are rendered and CSS picks one, so the page rendered by the server is already the right one on any screen */}
      <Box sx={{ display: { xs: 'none', xl: 'block' } }}>
        <Typography component="p" variant="overline" sx={{ mb: 1 }}>
          Informations complémentaires
        </Typography>
        {domainSelector}
        <DomainReputationSummary reputation={reputation} />
        <Button variant="outlined" size="small" onClick={() => setDetailsOpen(true)} sx={{ mt: 3 }}>
          Voir tout le détail
        </Button>
        <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} fullWidth maxWidth="lg">
          <DialogTitle>Notoriété, sécurité et conformité</DialogTitle>
          {/* Otherwise the texts only for screen readers, being absolutely positioned, make the whole modal scrollable too */}
          <DialogContent dividers sx={{ position: 'relative' }}>
            {details}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDetailsOpen(false)}>Fermer</Button>
          </DialogActions>
        </Dialog>
      </Box>
      <Box sx={{ display: { xs: 'block', xl: 'none' } }}>
        <Typography component="h2" variant="h4" sx={{ m: 0, mb: 1 }}>
          Notoriété sur internet
        </Typography>
        {details}
      </Box>
    </Box>
  );
}
