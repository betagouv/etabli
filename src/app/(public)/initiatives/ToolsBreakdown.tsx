'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { keepPreviousData } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@etabli/src/client/trpcClient';
import { GetToolsBreakdownSchemaType } from '@etabli/src/models/actions/initiative';
import { ToolCategorySchema, ToolCategorySchemaType } from '@etabli/src/models/entities/tool';

function formatPercentage(percentage: number): string {
  // Tiny values would be displayed as 0 whereas they exist
  if (percentage > 0 && percentage < 0.1) {
    return '< 0,1 %';
  }

  return `${percentage.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function BreakdownRow(props: { label: string; percentage: number; color: string; muted?: boolean }) {
  return (
    <Box component="li" sx={{ py: '0.25rem' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="caption" color={props.muted ? 'text.secondary' : 'text.primary'}>
          {props.label}
        </Typography>
        <Typography variant="caption" color={props.muted ? 'text.secondary' : 'text.primary'} sx={{ fontWeight: 600, flexShrink: 0 }}>
          {formatPercentage(props.percentage)}
        </Typography>
      </Box>
      <Box sx={{ height: 6, bgcolor: 'var(--background-alt-grey)', borderRadius: '2px', mt: '2px' }} aria-hidden="true">
        <Box
          sx={{ height: '100%', width: `${props.percentage}%`, minWidth: props.percentage > 0 ? 2 : 0, bgcolor: props.color, borderRadius: '2px' }}
        />
      </Box>
    </Box>
  );
}

export interface ToolsBreakdownProps {
  nodeId: string; // An organization, or a virtual node of the map
  filterBy: GetToolsBreakdownSchemaType['filterBy'];
}

export function ToolsBreakdown(props: ToolsBreakdownProps) {
  const { t } = useTranslation('common');
  const [category, setCategory] = useState<ToolCategorySchemaType>('LANGUAGES_AND_FRAMEWORKS');

  const { data, isPending } = trpc.getToolsBreakdown.useQuery(
    { nodeId: props.nodeId, category: category, filterBy: props.filterBy },
    { placeholderData: keepPreviousData }
  );

  const categories = useMemo(
    () =>
      ToolCategorySchema.options
        .map((value) => ({ value, label: t(`model.tool.category.enum.${value}`) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    [t]
  );

  return (
    <Box sx={{ mt: 3 }}>
      <Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>
        Technologies utilisées
      </Typography>
      <TextField
        select
        fullWidth
        size="small"
        label="Type d'outil"
        value={category}
        onChange={(event) => setCategory(event.target.value as ToolCategorySchemaType)}
      >
        {categories.map(({ value, label }) => (
          <MenuItem key={value} value={value}>
            {label}
          </MenuItem>
        ))}
      </TextField>
      {isPending || !data ? (
        <Box sx={{ py: 2 }}>
          <CircularProgress size={16} aria-label="chargement" />
        </Box>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, mb: 0 }}>
            Part des initiatives utilisant chaque outil
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: '0.25rem' }} aria-label="répartition des outils">
            {data.tools.map((tool) => (
              <BreakdownRow key={tool.name} label={tool.name} percentage={tool.percentage} color="var(--text-action-high-blue-france)" />
            ))}
            {data.othersPercentage > 0 && <BreakdownRow label="Autres" percentage={data.othersPercentage} color="var(--text-mention-grey)" />}
            <BreakdownRow label="Non renseigné" percentage={data.notSpecifiedPercentage} color="var(--border-plain-grey)" muted />
          </Box>
        </>
      )}
    </Box>
  );
}
