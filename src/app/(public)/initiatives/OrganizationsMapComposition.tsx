'use client';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { InitiativesCompositionSchemaType } from '@etabli/src/models/entities/organization';
import {
  MapColorMode,
  MapNodeData,
  compositionColorsSx,
  compositionKinds,
  getMapScaleVariable,
  mapScaleLabels,
  mapScaleSteps,
} from '@etabli/src/utils/organizations-map';

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
      componentsProps={{ tooltip: { sx: { ...compositionColorsSx, minWidth: 280 } } }}
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

// What a node is made of for the way circles are colored
export function MapNodeBreakdown(props: { node: MapNodeData; colorMode: MapColorMode; withDetails?: boolean; alwaysDetailed?: boolean }) {
  if (props.colorMode === 'composition') {
    return props.alwaysDetailed ? (
      <>
        <CompositionBar composition={props.node.composition} />
        <Box sx={{ mt: 1 }}>
          <CompositionDetails composition={props.node.composition} />
        </Box>
      </>
    ) : (
      <CompositionBar composition={props.node.composition} withDetails={props.withDetails} />
    );
  }

  const mode = props.colorMode;
  const counts = props.node.distribution[mode];
  const total = counts.reduce((sum, count) => sum + count, 0);
  const median = mode === 'reputation' ? props.node.organization?.relativeReputation : null;

  if (total === 0) {
    return null;
  }

  const details = (
    <>
      {typeof median === 'number' && (
        <Typography variant="caption" component="div" sx={{ fontWeight: 600, mb: 0.5 }}>
          Notoriété médiane : {median} %
        </Typography>
      )}
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {[...mapScaleLabels[mode].entries()]
          .map(([step, label]) => ({ variable: getMapScaleVariable(mode, step), label: label, count: counts[step - 1] }))
          .concat([{ variable: getMapScaleVariable(mode, null), label: 'Sans valeur', count: counts[5] }])
          .map(({ variable, label, count }) => (
            <Box component="li" key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: `var(${variable})`, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ flex: 1 }}>
                {label}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {count.toLocaleString('fr-FR')}
              </Typography>
            </Box>
          ))}
      </Box>
    </>
  );
  const bar = (
    <Box sx={{ display: 'flex', gap: '2px', height: 6, width: '100%' }} aria-hidden="true">
      {[...[...mapScaleSteps].reverse(), null].map((step) =>
        counts[step === null ? 5 : step - 1] > 0 ? (
          <Box
            key={step ?? 'none'}
            sx={{ flexGrow: counts[step === null ? 5 : step - 1], bgcolor: `var(${getMapScaleVariable(mode, step)})`, borderRadius: '2px' }}
          />
        ) : null
      )}
    </Box>
  );

  if (props.alwaysDetailed) {
    return (
      <>
        <Box sx={{ mt: 0.5 }}>{bar}</Box>
        <Box sx={{ mt: 1 }}>{details}</Box>
      </>
    );
  } else if (!props.withDetails) {
    return <Box sx={{ mt: 0.5 }}>{bar}</Box>;
  }

  return (
    <Tooltip title={details} enterTouchDelay={0} componentsProps={{ tooltip: { sx: { ...compositionColorsSx, minWidth: 240 } } }}>
      <Box
        tabIndex={0}
        role="img"
        aria-label={[...mapScaleLabels[mode].entries()]
          .map(([step, label]) => `${label} : ${counts[step - 1].toLocaleString('fr-FR')}`)
          .concat(`Sans valeur : ${counts[5].toLocaleString('fr-FR')}`)
          .join(', ')}
        sx={{ py: 0.5, cursor: 'help' }}
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
