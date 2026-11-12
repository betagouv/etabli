'use client';

import Chip from '@mui/material/Chip';
import NextLink from 'next/link';
import { useTranslation } from 'react-i18next';

import { FunctionalUseCaseSchemaType } from '@etabli/src/models/entities/initiative';

export interface FunctionalUseCaseChipProps {
  useCase: FunctionalUseCaseSchemaType;
  href?: string;
  linkDescription?: string; // For screen readers, what the link leads to
}

export function FunctionalUseCaseChip(props: FunctionalUseCaseChipProps) {
  const { t } = useTranslation('common');

  return (
    <Chip
      label={
        <>
          {t(`model.initiative.functionalUseCase.enum.${props.useCase}`)}
          {props.href && props.linkDescription && <span className="fr-sr-only"> : {props.linkDescription}</span>}
        </>
      }
      {...(props.href ? { component: NextLink, href: props.href, clickable: true } : {})}
      sx={{
        ...(props.href ? { backgroundImage: 'none !important' } : {}), // The DSFR underline of links does not suit a chip
        bgcolor: 'var(--background-contrast-green-tilleul-verveine)',
        '&.MuiChip-clickable:hover, &.MuiChip-clickable:focus-visible': { bgcolor: 'var(--background-contrast-green-tilleul-verveine-hover)' },
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
