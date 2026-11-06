'use client';

import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { SxProps, Theme } from '@mui/material/styles';

import { lightTooltipSlotProps } from '@etabli/src/components/OrganizationChip';

export interface ReputationChipProps {
  rank: number;
  sx?: SxProps<Theme>;
}

export function ReputationChip(props: ReputationChipProps) {
  return (
    <Tooltip
      arrow
      describeChild
      componentsProps={lightTooltipSlotProps}
      title="Calculé à partir des liens reçus par ses sites internet et de leur qualité. Il ne mesure pas la qualité du service."
    >
      <Chip size="small" variant="outlined" icon={<TrendingUpIcon aria-hidden="true" />} label={`Réputation ${props.rank}/100`} sx={props.sx} />
    </Tooltip>
  );
}
