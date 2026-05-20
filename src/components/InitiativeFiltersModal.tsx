'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@etabli/src/client/trpcClient';
import { FunctionalUseCaseSchema, FunctionalUseCaseSchemaType } from '@etabli/src/models/entities/initiative';

export interface InitiativeFiltersValue {
  functionalUseCases: FunctionalUseCaseSchemaType[];
  toolIds: string[];
  hasWebsite: boolean;
  hasRepository: boolean;
}

export const emptyInitiativeFilters: InitiativeFiltersValue = {
  functionalUseCases: [],
  toolIds: [],
  hasWebsite: false,
  hasRepository: false,
};

export function countActiveFilters(value: InitiativeFiltersValue): number {
  return value.functionalUseCases.length + value.toolIds.length + (value.hasWebsite ? 1 : 0) + (value.hasRepository ? 1 : 0);
}

export interface InitiativeFiltersModalProps {
  open: boolean;
  value: InitiativeFiltersValue;
  onClose: () => void;
  onApply: (next: InitiativeFiltersValue) => void;
}

export function InitiativeFiltersModal(props: InitiativeFiltersModalProps) {
  const { t } = useTranslation('common');

  // Local draft state so closing the modal without "Appliquer" discards changes.
  const [draft, setDraft] = useState<InitiativeFiltersValue>(props.value);

  // Reset draft each time the modal opens to mirror the parent's committed value.
  const [previouslyOpen, setPreviouslyOpen] = useState(props.open);
  if (props.open !== previouslyOpen) {
    setPreviouslyOpen(props.open);
    if (props.open) {
      setDraft(props.value);
    }
  }

  const toolsQuery = trpc.listTools.useQuery(undefined, { enabled: props.open });

  const functionalUseCaseOptions = useMemo(() => {
    return FunctionalUseCaseSchema.options
      .map((value) => ({
        value,
        label: t(`model.initiative.functionalUseCase.enum.${value}`),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }, [t]);

  const selectedFunctionalUseCases = useMemo(
    () => functionalUseCaseOptions.filter((o) => draft.functionalUseCases.includes(o.value)),
    [functionalUseCaseOptions, draft.functionalUseCases]
  );

  const toolOptions = useMemo(() => toolsQuery.data?.tools ?? [], [toolsQuery.data]);
  const selectedTools = useMemo(() => toolOptions.filter((o) => draft.toolIds.includes(o.id)), [toolOptions, draft.toolIds]);

  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>Filtrer les initiatives</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={functionalUseCaseOptions}
            value={selectedFunctionalUseCases}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(a, b) => a.value === b.value}
            onChange={(_, next) => setDraft((d) => ({ ...d, functionalUseCases: next.map((o) => o.value) }))}
            renderInput={(params) => (
              <TextField {...params} label="Cas fonctionnels" placeholder={selectedFunctionalUseCases.length === 0 ? 'Tous' : undefined} />
            )}
          />
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={toolOptions}
            value={selectedTools}
            loading={toolsQuery.isLoading}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, next) => setDraft((d) => ({ ...d, toolIds: next.map((o) => o.id) }))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Outils utilisés"
                placeholder={selectedTools.length === 0 ? 'Tous' : undefined}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {toolsQuery.isLoading ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          <FormControlLabel
            control={<Checkbox checked={draft.hasWebsite} onChange={(e) => setDraft((d) => ({ ...d, hasWebsite: e.target.checked }))} />}
            label="Possède au moins un site internet"
          />
          <FormControlLabel
            control={<Checkbox checked={draft.hasRepository} onChange={(e) => setDraft((d) => ({ ...d, hasRepository: e.target.checked }))} />}
            label="Possède au moins un dépôt de code"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDraft(emptyInitiativeFilters)}>Réinitialiser</Button>
        <Button onClick={props.onClose}>Annuler</Button>
        <Button variant="contained" onClick={() => props.onApply(draft)}>
          Appliquer
        </Button>
      </DialogActions>
    </Dialog>
  );
}
