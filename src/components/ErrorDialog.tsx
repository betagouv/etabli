import Button from '@mui/lab/LoadingButton';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import { TRPCClientErrorLike } from '@trpc/client';
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
          <Grid container direction="column" spacing={2}>
            <Grid item component="p" xs={12}>
              {props.description || 'Une erreur est survenue lors de votre précédente action.'}
            </Grid>
            <Grid item xs={12}>
              <ErrorAlert errors={[props.error]} />
            </Grid>
          </Grid>
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
