'use client';

import Chip from '@mui/material/Chip';

export interface BusinessUseCaseChipProps {
  label: string;
}

export function BusinessUseCaseChip(props: BusinessUseCaseChipProps) {
  return <Chip label={props.label} sx={{ bgcolor: 'var(--background-contrast-blue-france)' }} />;
}
