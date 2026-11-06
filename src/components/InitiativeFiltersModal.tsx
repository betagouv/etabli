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
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@etabli/src/client/trpcClient';
import { OrganizationPicker } from '@etabli/src/components/OrganizationPicker';
import {
  FunctionalUseCaseSchema,
  FunctionalUseCaseSchemaType,
  GradeLetterSchema,
  GradeLetterSchemaType,
  LegalLinkPresenceSchema,
  LegalLinkPresenceSchemaType,
} from '@etabli/src/models/entities/initiative';

export interface InitiativeFiltersValue {
  functionalUseCases: FunctionalUseCaseSchemaType[];
  toolIds: string[];
  organizationIds: string[];
  unclassified: boolean; // Initiatives bound to no organization
  hasWebsite: boolean;
  hasRepository: boolean;
  httpSecurityGrades: GradeLetterSchemaType[];
  tlsGrades: GradeLetterSchemaType[];
  legalNotice: LegalLinkPresenceSchemaType | null;
  privacyPolicy: LegalLinkPresenceSchemaType | null;
}

export const emptyInitiativeFilters: InitiativeFiltersValue = {
  functionalUseCases: [],
  toolIds: [],
  organizationIds: [],
  unclassified: false,
  hasWebsite: false,
  hasRepository: false,
  httpSecurityGrades: [],
  tlsGrades: [],
  legalNotice: null,
  privacyPolicy: null,
};

export function countActiveFilters(value: InitiativeFiltersValue): number {
  return (
    value.functionalUseCases.length +
    value.toolIds.length +
    value.organizationIds.length +
    (value.unclassified ? 1 : 0) +
    (value.hasWebsite ? 1 : 0) +
    (value.hasRepository ? 1 : 0) +
    value.httpSecurityGrades.length +
    value.tlsGrades.length +
    (value.legalNotice ? 1 : 0) +
    (value.privacyPolicy ? 1 : 0)
  );
}

function parseLegalLinkPresence(value: string): LegalLinkPresenceSchemaType | null {
  return LegalLinkPresenceSchema.safeParse(value).data ?? null;
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
          <OrganizationPicker
            value={{ organizationIds: draft.organizationIds, unclassified: draft.unclassified }}
            onChange={(next) => setDraft((d) => ({ ...d, organizationIds: next.organizationIds, unclassified: next.unclassified }))}
            enabled={props.open}
          />
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
          <Autocomplete
            multiple
            options={GradeLetterSchema.options}
            value={draft.httpSecurityGrades}
            onChange={(_, next) => setDraft((d) => ({ ...d, httpSecurityGrades: next }))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Sécurité web"
                helperText="Note du site le moins bien noté de l'initiative"
                placeholder={draft.httpSecurityGrades.length === 0 ? 'Toutes' : undefined}
              />
            )}
          />
          <Autocomplete
            multiple
            options={GradeLetterSchema.options}
            value={draft.tlsGrades}
            onChange={(_, next) => setDraft((d) => ({ ...d, tlsGrades: next }))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Note TLS"
                helperText="Note du site le moins bien noté de l'initiative, F inclut les problèmes de certificat"
                placeholder={draft.tlsGrades.length === 0 ? 'Toutes' : undefined}
              />
            )}
          />
          <TextField
            select
            label="Mentions légales"
            helperText="Non trouvé dès qu'un des sites de l'initiative n'a pas de lien sur sa page d'accueil"
            value={draft.legalNotice ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, legalNotice: parseLegalLinkPresence(e.target.value) }))}
          >
            <MenuItem value="">Peu importe</MenuItem>
            <MenuItem value="with">Lien trouvé</MenuItem>
            <MenuItem value="without">Lien non trouvé</MenuItem>
          </TextField>
          <TextField
            select
            label="Politique de confidentialité"
            helperText="Non trouvé dès qu'un des sites de l'initiative n'a pas de lien sur sa page d'accueil"
            value={draft.privacyPolicy ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, privacyPolicy: parseLegalLinkPresence(e.target.value) }))}
          >
            <MenuItem value="">Peu importe</MenuItem>
            <MenuItem value="with">Lien trouvé</MenuItem>
            <MenuItem value="without">Lien non trouvé</MenuItem>
          </TextField>
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
