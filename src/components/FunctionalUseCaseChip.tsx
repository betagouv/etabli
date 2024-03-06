'use client';

import Chip from '@mui/material/Chip';
import { useTranslation } from 'react-i18next';

import { FunctionalUseCaseSchemaType } from '@etabli/src/models/entities/initiative';

export interface FunctionalUseCaseChipProps {
  useCase: FunctionalUseCaseSchemaType;
}

export function FunctionalUseCaseChip(props: FunctionalUseCaseChipProps) {
  const { t } = useTranslation('common');

  return (
    <Chip
      label={t(`model.initiative.functionalUseCase.enum.${props.useCase}`)}
      sx={{
        bgcolor: 'var(--background-contrast-green-tilleul-verveine)',
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
