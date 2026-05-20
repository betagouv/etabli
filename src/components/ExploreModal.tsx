'use client';

import CloseIcon from '@mui/icons-material/Close';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useRef } from 'react';

import { ShowModalProps } from '@etabli/src/components/modal/ModalContext';
import { useSingletonModal } from '@etabli/src/components/modal/useModal';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

export type ExploreModalProps = ShowModalProps;

export function ExploreModal(props: ExploreModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const initiativesPath = linkRegistry.get('initiatives', undefined);
  const assistantPath = linkRegistry.get('assistant', undefined);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = inputRef.current?.value.trim() ?? '';
    router.push(value ? `${initiativesPath}?q=${encodeURIComponent(value)}` : initiativesPath);
    props.onClose();
  };

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="explore-modal-title"
      // MUI Dialog focus-traps to the close button (rendered first in the DOM) on open, so the TextField's
      // `autoFocus` prop loses. Focus it manually after the enter transition completes.
      TransitionProps={{ onEntered: () => inputRef.current?.focus() }}
    >
      <Box sx={{ position: 'absolute', right: 8, top: 8 }}>
        <IconButton aria-label="fermer" onClick={props.onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      <DialogContent>
        <Typography id="explore-modal-title" component="h2" variant="h4" sx={{ textAlign: 'center', mt: 1, mb: { xs: 3, sm: 4 }, pr: 4 }}>
          Que cherchez-vous&nbsp;?
        </Typography>
        <Box component="form" onSubmit={submit}>
          <Stack direction="row" spacing={2} alignItems="stretch">
            <TextField inputRef={inputRef} type="search" name="q" fullWidth placeholder="Un nom, un outil, un cas d'utilisation…" />
            <Button type="submit" variant="contained" aria-label="lancer la recherche" sx={{ flexShrink: 0, minWidth: 56, px: 2 }}>
              <SearchIcon />
            </Button>
          </Stack>
          <Alert icon={<LightbulbOutlinedIcon />} severity="info" sx={{ mt: 3, alignItems: 'flex-start' }}>
            <AlertTitle>Besoin d&apos;un coup de pouce&nbsp;?</AlertTitle>
            Si vous ne savez pas par où commencer,{' '}
            <Link component={NextLink} href={assistantPath} underline="hover" onClick={props.onClose}>
              parlez-en à notre assistant
            </Link>
            . Vous pouvez aussi{' '}
            <Link component={NextLink} href={initiativesPath} underline="hover" onClick={props.onClose}>
              parcourir l&apos;annuaire complet
            </Link>
            .
          </Alert>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export const useSingletonExploreModal = () => {
  const { showModal } = useSingletonModal();

  return {
    showExploreModal() {
      showModal((modalProps) => {
        return <ExploreModal {...modalProps} />;
      });
    },
  };
};
