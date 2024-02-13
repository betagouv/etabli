import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import * as React from 'react';

export interface LoadingAreaProps {
  ariaLabelTarget: string;
  minHeight?: string | null;
  height?: string | null;
  loaderSize?: number | 'medium' | 'large' | 'small';
}

export const LoadingArea = (props: LoadingAreaProps) => {
  const ariaLabel = `zone en cours de chargement - ${props.ariaLabelTarget}`;
  let loaderSize: number;

  if (!props.loaderSize || props.loaderSize === 'medium') {
    loaderSize = 30;
  } else if (props.loaderSize === 'large') {
    loaderSize = 40;
  } else if (props.loaderSize === 'small') {
    loaderSize = 20;
  } else {
    throw new Error('wrong loader size provided');
  }

  return (
    <Box
      aria-busy={true}
      sx={{
        display: 'flex',
        flex: '1 1 auto',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <CircularProgress size={loaderSize} aria-label={ariaLabel} />
    </Box>
  );
};
