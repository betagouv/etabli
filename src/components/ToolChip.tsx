'use client';

import Chip from '@mui/material/Chip';
import NextLink from 'next/link';

export interface ToolChipProps {
  label: string;
  href?: string;
  linkDescription?: string; // For screen readers, what the link leads to
}

export function ToolChip(props: ToolChipProps) {
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
        bgcolor: 'var(--background-contrast-brown-opera)',
        '&.MuiChip-clickable:hover, &.MuiChip-clickable:focus-visible': { bgcolor: 'var(--background-contrast-brown-opera-hover)' },
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
