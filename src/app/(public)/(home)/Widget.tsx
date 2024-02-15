import { fr } from '@codegouvfr/react-dsfr';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import * as React from 'react';

export function Widget({ children, title, icon }: { children: React.ReactNode; title: string; icon: React.ReactElement }) {
  return (
    <Paper variant="outlined" sx={{ height: '100%', px: 4, py: 3 }}>
      <Typography component="div" variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
        <Box
          sx={{
            display: 'inline-block',
            color: fr.colors.decisions.text.title.blueFrance.default,
            lineHeight: 0,
            verticalAlign: 'middle',
            mr: 1,
          }}
        >
          {icon}
        </Box>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}
