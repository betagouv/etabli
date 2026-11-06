'use client';

import StarBorderIcon from '@mui/icons-material/StarBorder';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { SxProps, Theme } from '@mui/material/styles';

import { InitiativeSchemaType } from '@etabli/src/models/entities/initiative';

const numberFormatter = new Intl.NumberFormat('fr-FR');

// By default the icon is almost stuck to the rounded border
const chipSx = { '& .MuiChip-icon': { fontSize: 16, ml: '8px', mr: '-2px' } };

export interface InitiativeRankingChipsProps {
  initiative: Pick<InitiativeSchemaType, 'relativeReputation' | 'repositoryStars' | 'websites'>;
  sx?: SxProps<Theme>;
}

export function InitiativeRankingChips({ initiative, sx }: InitiativeRankingChipsProps) {
  if (!initiative.relativeReputation && !initiative.repositoryStars) {
    return null;
  }

  return (
    <Box sx={[{ display: 'flex', flexWrap: 'wrap', gap: 1 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {!!initiative.relativeReputation && (
        <Tooltip
          describeChild
          title={
            initiative.websites.length > 0
              ? "Comparée aux initiatives les plus citées d'Établi, d'après les liens externes vers ses sites. Elle ne mesure pas la qualité du service."
              : "Comparée aux initiatives les plus citées d'Établi, d'après les étoiles de ses dépôts de code (divisées par 2 s'ils sont archivés). Elle ne mesure pas la qualité du service."
          }
        >
          <Chip
            size="small"
            variant="outlined"
            sx={chipSx}
            icon={<TrendingUpIcon aria-hidden="true" />}
            label={`Réputation ${initiative.relativeReputation} %`}
          />
        </Tooltip>
      )}
      {!!initiative.repositoryStars && (
        <Tooltip describeChild title="Étoiles de son dépôt de code le plus suivi, elles indiquent l'intérêt de la communauté de développeurs.">
          <Chip
            size="small"
            variant="outlined"
            sx={chipSx}
            icon={<StarBorderIcon aria-hidden="true" />}
            label={
              <>
                {numberFormatter.format(initiative.repositoryStars)}
                <span className="fr-sr-only"> étoiles</span>
              </>
            }
          />
        </Tooltip>
      )}
    </Box>
  );
}
