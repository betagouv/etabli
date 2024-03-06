'use client';

import Chip from '@mui/material/Chip';

export interface ToolChipProps {
  label: string;
}

export function ToolChip(props: ToolChipProps) {
  return (
    <Chip
      label={props.label}
      sx={{
        bgcolor: 'var(--background-contrast-brown-opera)',
        height: 'auto',
        p: '5px',
        '& > .MuiChip-label': {
          whiteSpace: 'pre-wrap !important',
          wordBreak: 'break-word !important', // Needed in case of word/sentence bigger than parent width
        },
      }}
    />
  );
}
