import { GridProps } from '@mui/material/Grid';

export const wideContainerGridProps: GridProps = {
  sx: {
    px: 3,
    py: 6,
  },
};

export const centeredContainerGridProps: GridProps = {
  sx: {
    ...wideContainerGridProps.sx,
    maxWidth: 'lg',
    mx: 'auto',
    width: '100%', // [WORKAROUND] When using `mx: auto` it does a weird thing like `width: calc(100% + 2.5rem)`... maybe due to DSFR values
  },
};

export const centeredFormContainerGridProps: GridProps = {
  direction: 'column',
  sx: {
    ...wideContainerGridProps.sx,
    maxWidth: '460px',
    mx: 'auto',
    justifyContent: 'center',
  },
};

export const mdCenteredFormContainerGridProps = {
  ...centeredFormContainerGridProps,
  sx: {
    ...centeredFormContainerGridProps.sx,
    maxWidth: 'md',
  },
};

export const centeredAlertContainerGridProps: GridProps = {
  direction: 'column',
  sx: {
    ...wideContainerGridProps.sx,
    maxWidth: 'md',
    mx: 'auto',
    justifyContent: 'center',
  },
};

export const centeredErrorContainerGridProps: GridProps = {
  direction: 'column',
  sx: {
    ...wideContainerGridProps.sx,
    maxWidth: 'xl',
    mx: 'auto',
    justifyContent: 'center',
  },
};

export const centeredContentContainerGridProps: GridProps = {
  direction: 'column',
  sx: {
    ...wideContainerGridProps.sx,
    maxWidth: 'xl',
    mx: 'auto',
    justifyContent: 'center',
  },
};

export const ulComponentResetStyles = {
  listStyle: 'none',
  paddingInlineStart: 0,
  marginBlockStart: 0,
  marginBlockEnd: 0,
};
