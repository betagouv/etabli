'use client';

import Chip from '@mui/material/Chip';

export interface ToolChipProps {
  label: string;
}

export function ToolChip(props: ToolChipProps) {
  return <Chip label={props.label} sx={{ bgcolor: 'var(--background-contrast-brown-opera)' }} />;
}
