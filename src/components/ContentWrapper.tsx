import Box from '@mui/material/Box';
import { PropsWithChildren } from 'react';

export function ContentWrapper(props: PropsWithChildren) {
  return (
    <Box
      component="main"
      role="main"
      sx={{
        display: 'flex',
        flex: '1 1 auto',
      }}
    >
      {props.children}
    </Box>
  );
}
