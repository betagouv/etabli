'use client';

import Chip from '@mui/material/Chip';
import NextLink from 'next/link';

export interface BusinessUseCaseChipProps {
  label: string;
  href?: string;
  linkDescription?: string; // For screen readers, what the link leads to
}

export function BusinessUseCaseChip(props: BusinessUseCaseChipProps) {
  return (
    <Chip
      label={
        <>
          {props.label}
          {props.href && props.linkDescription && <span className="fr-sr-only"> : {props.linkDescription}</span>}
        </>
      }
      {...(props.href ? { component: NextLink, href: props.href, clickable: true } : {})}
      sx={{
        ...(props.href ? { backgroundImage: 'none !important' } : {}), // The DSFR underline of links does not suit a chip
        bgcolor: 'var(--background-contrast-blue-france)',
        '&.MuiChip-clickable:hover, &.MuiChip-clickable:focus-visible': { bgcolor: 'var(--background-contrast-blue-france-hover)' },
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
