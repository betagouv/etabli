'use client';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { trpc } from '@etabli/src/client/trpcClient';
import { DomainReputationSchemaType } from '@etabli/src/models/entities/initiative';

const unavailableValue = 'Valeur non disponible';
const notSignificantValue = 'Non significatif';
const numberFormatter = new Intl.NumberFormat('fr-FR');
const dateFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });
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

function InfoBubble(props: { label: string; description: string }) {
  return (
    <Tooltip title={props.description}>
      <IconButton size="small" aria-label={`À propos de « ${props.label} » : ${props.description}`} sx={{ p: 0.25, flexShrink: 0 }}>
        <InfoOutlinedIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );
}

function Metric(props: { label: string; value: string; description: string }) {
  const isAvailable = props.value !== unavailableValue && props.value !== notSignificantValue;

  return (
    <Box sx={{ ...panelSx, p: '20px !important' }}>
      <Box component="dt" sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Typography component="span" variant="body2" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {props.label}
        </Typography>
        <InfoBubble label={props.label} description={props.description} />
      </Box>
      <Typography
        component="dd"
        sx={{
          m: '0 !important', // The DSFR indents definitions
          pl: '0 !important',
          pt: 1,
          fontWeight: isAvailable ? 700 : 400,
          fontSize: isAvailable ? { xs: '1.5rem', md: '2rem' } : '0.875rem',
          lineHeight: 1.2,
          color: isAvailable ? undefined : 'var(--text-mention-grey)',
        }}
      >
        {props.value}
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
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
              // The row is tall enough for an anchored tooltip to be far from the pointer and to hide the row above
              <Tooltip key={key} followCursor arrow={false} title={`${label} : ${numberFormatter.format(value)} lien${value > 1 ? 's' : ''}`}>
                <Box component="li" sx={{ py: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography component="span" variant="body2" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {label}
                    </Typography>
                    <Typography component="span" variant="body2" sx={{ flexShrink: 0, fontWeight: 700 }}>
                      {share < 1 ? '< 1' : Math.round(share)}&nbsp;%
                    </Typography>
                  </Box>
                  <Box aria-hidden="true" sx={{ height: 8, mt: 0.75, borderRadius: '4px', bgcolor: 'var(--background-contrast-grey)' }}>
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

function DomainReputation({ reputation }: { reputation: DomainReputationSchemaType }) {
  return (
    <Box component="section" aria-label={`Réputation de ${reputation.domain}`}>
      <Box
        component="dl"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          gap: 2,
          m: 0,
          p: 0,
        }}
      >
        <Metric
          label="Score de réputation"
          value={getScoreLabel(reputation.rank)}
          description={`Calculé sur l'ensemble d'internet à partir des liens externes vers ce site et de leur qualité. Il ne mesure pas la qualité du service.${
            reputation.rank === 0 ? ' Il y a ici trop peu de liens pour obtenir un score.' : ''
          }`}
        />
        <Metric
          label="Sécurité web"
          value={reputation.httpSecurityGrade ?? unavailableValue}
          description="Note de A+ à F donnée par Mozilla HTTP Observatory aux protections que le site déclare au navigateur (en-têtes de sécurité, cookies). Elle ne couvre pas tous les aspects de la sécurité du site."
        />
        <Metric
          label="Sites externes"
          value={formatNumber(reputation.referringDomains)}
          description="Nombre d'autres sites ayant au moins un lien vers ce site. Les sous-domaines sont comptés séparément."
        />
        <Metric
          label="Domaines externes"
          value={formatNumber(reputation.referringMainDomains)}
          description="Nombre d'acteurs externes différents faisant un lien vers ce site : blog.exemple.fr et www.exemple.fr ne comptent que pour un seul exemple.fr."
        />
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
          value={reputation.firstSeenAt ? dateFormatter.format(reputation.firstSeenAt) : unavailableValue}
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
    </Box>
  );
}

export interface InitiativeReputationDashboardProps {
  initiativeId: string;
}

// It stays secondary and the score is not compared to other initiatives, since public services are not in competition
export function InitiativeReputationDashboard(props: InitiativeReputationDashboardProps) {
  const { data } = trpc.getInitiativeReputation.useQuery({ id: props.initiativeId });
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  if (!data || data.domains.length === 0) {
    return null;
  }

  // Domains are sorted by reputation, so the best one is displayed by default
  const reputation = data.domains.find(({ domain }) => domain === selectedDomain) ?? data.domains[0];

  return (
    <Grid item xs={12} sx={{ mt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography component="h2" variant="h4" sx={{ m: 0 }}>
          Réputation sur internet
        </Typography>
        <InfoBubble
          label="Réputation sur internet"
          description={`Données du service tiers récupérées le ${fullDateFormatter.format(reputation.lastCheckAt)}.`}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        D&apos;après les liens que les autres sites font vers celui-ci, estimés par un service tiers.
      </Typography>
      {data.domains.length > 1 && (
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
          {data.domains.map(({ domain, rank }) => (
            <MenuItem key={domain} value={domain}>
              {domain}
              {rank !== null ? ` (${rank}/100)` : ''}
            </MenuItem>
          ))}
        </TextField>
      )}
      <DomainReputation key={reputation.domain} reputation={reputation} />
    </Grid>
  );
}
