import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import { TRPCClientErrorLike } from '@trpc/client';
import type { JSX } from 'react';
import { useRef } from 'react';

import { ErrorAlert } from '@etabli/src/components/ErrorAlert';
import { AppRouter } from '@etabli/src/server/app-router';

export interface ErrorDialogProps {
  open: boolean;
  title?: string;
  description?: string | JSX.Element;
  error: TRPCClientErrorLike<AppRouter> | Error; // Error can be from the network (tRPC most of the time) or local
  onClose: () => void;
}

export const ErrorDialog = (props: ErrorDialogProps) => {
  const dialogContentRef = useRef<HTMLDivElement | null>(null); // This is used to scroll to the error messages

  const closeCallback = () => {
    props.onClose();
  };

  return (
    <Dialog
      fullWidth
      open={props.open}
      onClose={() => {
        closeCallback();
      }}
    >
      <DialogTitle>{props.title || 'Erreur'}</DialogTitle>
      <DialogContent ref={dialogContentRef}>
        <DialogContentText component="div">
          <Stack spacing={2}>
            <Box component="p" sx={{ m: 0 }}>
              {props.description || 'Une erreur est survenue lors de votre précédente action.'}
            </Box>
            <ErrorAlert errors={[props.error]} />
          </Stack>
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button
          color="primary"
          onClick={async () => {
            closeCallback();
          }}
          variant="contained"
        >
          D&apos;accord
        </Button>
      </DialogActions>
    </Dialog>
  );
};
