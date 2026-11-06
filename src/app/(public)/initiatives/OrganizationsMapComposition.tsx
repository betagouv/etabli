'use client';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { lightTooltipSx } from '@etabli/src/components/OrganizationChip';
import { InitiativesCompositionSchemaType } from '@etabli/src/models/entities/organization';
import { compositionColorsSx, compositionKinds } from '@etabli/src/utils/organizations-map';

export function CompositionBar(props: { composition: InitiativesCompositionSchemaType; withDetails?: boolean }) {
  const total = props.composition.websitesOnly + props.composition.repositoriesOnly + props.composition.both;

  if (total === 0) {
    return null;
  }

  const bar = (
    <Box sx={{ display: 'flex', gap: '2px', height: 6, width: '100%' }} aria-hidden="true">
      {compositionKinds
        .filter(({ kind }) => props.composition[kind] > 0)
        .map(({ kind, variable }) => (
          <Box key={kind} sx={{ flexGrow: props.composition[kind], bgcolor: `var(${variable})`, borderRadius: '2px', minWidth: 2 }} />
        ))}
    </Box>
  );

  if (!props.withDetails) {
    return <Box sx={{ mt: 0.5 }}>{bar}</Box>;
  }

  return (
    <Tooltip
      title={<CompositionDetails composition={props.composition} />}
      enterTouchDelay={0}
      // Tooltips are rendered outside of the map, so the colors must be provided again
      componentsProps={{ tooltip: { sx: { ...lightTooltipSx, ...compositionColorsSx, minWidth: 280 } } }}
    >
      <Box
        tabIndex={0}
        role="img"
        aria-label={compositionKinds.map(({ kind, label }) => `${label} : ${props.composition[kind].toLocaleString('fr-FR')}`).join(', ')}
        sx={{ py: 0.5, cursor: 'help' }} // A bigger area to hover
      >
        {bar}
      </Box>
    </Tooltip>
  );
}

export function CompositionDetails(props: { composition: InitiativesCompositionSchemaType }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {compositionKinds.map(({ kind, label, variable }) => (
        <Box component="li" key={kind} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: `var(${variable})`, flexShrink: 0 }} aria-hidden="true" />
          <Typography variant="caption" sx={{ flex: 1 }}>
            {label}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {props.composition[kind].toLocaleString('fr-FR')}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
