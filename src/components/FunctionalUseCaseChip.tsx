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
      sx={{ bgcolor: 'var(--background-contrast-green-tilleul-verveine)' }}
    />
  );
}
