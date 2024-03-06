'use client';

import Chip from '@mui/material/Chip';

export interface BusinessUseCaseChipProps {
  label: string;
}

export function BusinessUseCaseChip(props: BusinessUseCaseChipProps) {
  return (
    <Chip
      label={props.label}
      sx={{
        bgcolor: 'var(--background-contrast-blue-france)',
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
