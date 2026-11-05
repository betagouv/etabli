'use client';

import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Box from '@mui/material/Box';
import Chip, { ChipProps } from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { SxProps, Theme } from '@mui/material/styles';
import { forwardRef } from 'react';

import { InitiativeSchemaType } from '@etabli/src/models/entities/initiative';

// By default the icon is almost stuck to the rounded border
const chipSx = { '& .MuiChip-icon': { fontSize: 16, ml: '8px', mr: '-2px' } };

export interface ReputationChipProps extends Omit<ChipProps, 'label' | 'icon'> {
  relativeReputation: number;
}

// The reference is needed so the tooltip wrapping it can position itself
export const ReputationChip = forwardRef<HTMLDivElement, ReputationChipProps>(function ReputationChip({ relativeReputation, sx, ...chipProps }, ref) {
  return (
    <Chip
      {...chipProps}
      ref={ref}
      size="small"
      variant="outlined"
      sx={[chipSx, ...(Array.isArray(sx) ? sx : [sx])]}
      icon={<TrendingUpIcon aria-hidden="true" />}
      label={`Notoriété ${relativeReputation} %`}
    />
  );
});

export interface InitiativeRankingChipsProps {
  initiative: Pick<InitiativeSchemaType, 'relativeReputation' | 'websites' | 'repositories'>;
  sx?: SxProps<Theme>;
}

export function InitiativeRankingChips({ initiative, sx }: InitiativeRankingChipsProps) {
  if (!initiative.relativeReputation) {
    return null;
  }

  const hasSeveralWebsites = initiative.websites.length > 1;
  const hasSeveralRepositories = initiative.repositories.length > 1;

  return (
    <Box sx={[{ display: 'flex', flexWrap: 'wrap', gap: 1 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Tooltip
        describeChild
        title={
          initiative.websites.length > 0
            ? `Comparée aux initiatives les plus citées d'Établi, d'après les liens externes vers ${
                hasSeveralWebsites ? 'ses sites' : 'son site'
              }. Elle ne mesure pas la qualité du service.`
            : `Comparée aux initiatives les plus citées d'Établi, d'après les étoiles de ${
                hasSeveralRepositories
                  ? "ses dépôts de code (divisées par 2 s'ils sont archivés)"
                  : "son dépôt de code (divisées par 2 s'il est archivé)"
              }. Elle ne mesure pas la qualité du service.`
        }
      >
        {/* Focusable so keyboard users also get the explanation, the tooltip opens on focus too */}
        <ReputationChip relativeReputation={initiative.relativeReputation} tabIndex={0} />
      </Tooltip>
    </Box>
  );
}
