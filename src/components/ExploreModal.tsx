'use client';

import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Divider from '@mui/material/Divider';
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
      sx={{ '& .MuiDialog-paper': { mx: { xs: 2, sm: 4 }, width: { xs: 'calc(100% - 32px)', sm: 'calc(100% - 64px)' } } }}
      // MUI Dialog focus-traps to the close button (rendered first in the DOM) on open, so the TextField's
      // `autoFocus` prop loses. Focus it manually after the enter transition completes.
      TransitionProps={{ onEntered: () => inputRef.current?.focus() }}
    >
      <Box sx={{ position: 'absolute', right: 8, top: 8 }}>
        <IconButton aria-label="fermer" onClick={props.onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
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
          {/* Searching and browsing the map are two ways to start, not two steps */}
          <Divider sx={{ my: 2, color: 'text.secondary', typography: 'body2', '&::before, &::after': { borderColor: 'var(--border-default-grey)' } }}>
            ou
          </Divider>
          {/* Same signals as the other cards leading somewhere: an arrow, and the frame lighting up when pointed */}
          <Card
            variant="outlined"
            sx={{
              transition: 'box-shadow 120ms ease-in-out, border-color 120ms ease-in-out',
              '&:hover, &:focus-within': {
                boxShadow: 2,
                borderColor: 'primary.main',
                '& .explore-map-arrow': { color: 'primary.main', transform: 'translateX(2px)' },
              },
            }}
          >
            <CardActionArea
              component={NextLink}
              href={`${initiativesPath}?view=map`}
              rel="nofollow" // An interactive view not worth being crawled, and it is costly to compute
              onClick={props.onClose}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: '0.75rem', sm: 2 },
                p: { xs: '0.75rem', sm: 2 },
                backgroundImage: 'none !important',
              }} // DSFR paints a link underline as a background
            >
              {/* Smaller on phones so the text keeps enough width */}
              <Box sx={{ flexShrink: 0, width: { xs: 48, sm: 88 }, height: { xs: 48, sm: 88 } }} aria-hidden="true">
                {/* A glimpse of the map: colors are those of what initiatives are made of */}
                <svg viewBox="0 0 88 88" width="100%" height="100%">
                  <circle cx="44" cy="44" r="43" fill="var(--background-alt-grey)" stroke="var(--border-default-grey)" />
                  <circle cx="33" cy="52" r="22" fill="#c94c84" />
                  <circle cx="63" cy="32" r="14" fill="#6250d6" />
                  <circle cx="66" cy="61" r="8" fill="#8f7a00" />
                  <circle cx="40" cy="18" r="7" fill="#6250d6" />
                </svg>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="div" variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Voir la carte des organisations
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Une vue d&apos;ensemble de toutes les initiatives, de chaque ministère jusqu&apos;aux collectivités.
                </Typography>
              </Box>
              <ArrowForwardIcon
                className="explore-map-arrow"
                aria-hidden="true"
                sx={{ flexShrink: 0, color: 'text.secondary', transition: 'transform 120ms ease-in-out, color 120ms ease-in-out' }}
              />
            </CardActionArea>
          </Card>
          <Alert icon={<LightbulbOutlinedIcon />} severity="info" sx={{ mt: 2, alignItems: 'flex-start' }}>
            <AlertTitle>Besoin d&apos;un coup de pouce&nbsp;?</AlertTitle>
            Si vous ne savez pas par où commencer,{' '}
            <Link component={NextLink} href={assistantPath} underline="none" onClick={props.onClose}>
              parlez-en à notre assistant
            </Link>
            . Vous pouvez aussi{' '}
            <Link component={NextLink} href={initiativesPath} underline="none" onClick={props.onClose}>
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
