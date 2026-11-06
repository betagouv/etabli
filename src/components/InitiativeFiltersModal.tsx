'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
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
import Typography from '@mui/material/Typography';
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
import { foreignDependencyLevels, getForeignDependencyLevelLabel } from '@etabli/src/utils/foreign-dependencies';

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
  foreignDependencyLevels: number[];
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
  foreignDependencyLevels: [],
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
    (value.privacyPolicy ? 1 : 0) +
    value.foreignDependencyLevels.length
  );
}

function parseLegalLinkPresence(value: string): LegalLinkPresenceSchemaType | null {
  return LegalLinkPresenceSchema.safeParse(value).data ?? null;
}

const halfColumnsSx = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 };

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
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="md">
      <DialogTitle>Filtrer les initiatives</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3, pt: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <OrganizationPicker
              value={{ organizationIds: draft.organizationIds, unclassified: draft.unclassified }}
              onChange={(next) => setDraft((d) => ({ ...d, organizationIds: next.organizationIds, unclassified: next.unclassified }))}
              enabled={props.open}
            />
          </Box>
          <Stack spacing={2} sx={{ minWidth: 0 }}>
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
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <FormControlLabel
                control={<Checkbox checked={draft.hasWebsite} onChange={(e) => setDraft((d) => ({ ...d, hasWebsite: e.target.checked }))} />}
                label="Possède au moins un site internet"
              />
              <FormControlLabel
                control={<Checkbox checked={draft.hasRepository} onChange={(e) => setDraft((d) => ({ ...d, hasRepository: e.target.checked }))} />}
                label="Possède au moins un dépôt de code"
              />
            </Box>
            <Box sx={halfColumnsSx}>
              <Autocomplete
                multiple
                options={GradeLetterSchema.options}
                value={draft.httpSecurityGrades}
                onChange={(_, next) => setDraft((d) => ({ ...d, httpSecurityGrades: next }))}
                renderInput={(params) => (
                  <TextField {...params} label="Sécurité web" placeholder={draft.httpSecurityGrades.length === 0 ? 'Toutes' : undefined} />
                )}
              />
              <Autocomplete
                multiple
                options={GradeLetterSchema.options}
                value={draft.tlsGrades}
                onChange={(_, next) => setDraft((d) => ({ ...d, tlsGrades: next }))}
                renderInput={(params) => <TextField {...params} label="Note TLS" placeholder={draft.tlsGrades.length === 0 ? 'Toutes' : undefined} />}
              />
            </Box>
            <Autocomplete
              multiple
              options={foreignDependencyLevels.map((level) => level.value as number)}
              value={draft.foreignDependencyLevels}
              getOptionLabel={(value) => getForeignDependencyLevelLabel(value) ?? ''}
              onChange={(_, next) => setDraft((d) => ({ ...d, foreignDependencyLevels: next }))}
              renderInput={(params) => (
                <TextField {...params} label="Dépendance hors UE" placeholder={draft.foreignDependencyLevels.length === 0 ? 'Toutes' : undefined} />
              )}
            />
            <Box sx={halfColumnsSx}>
              <TextField
                select
                label="Mentions légales"
                value={draft.legalNotice ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, legalNotice: parseLegalLinkPresence(e.target.value) }))}
              >
                <MenuItem value="">Peu importe</MenuItem>
                <MenuItem value="with">Trouvé</MenuItem>
                <MenuItem value="without">Non trouvé</MenuItem>
              </TextField>
              <TextField
                select
                label="Confidentialité"
                value={draft.privacyPolicy ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, privacyPolicy: parseLegalLinkPresence(e.target.value) }))}
              >
                <MenuItem value="">Peu importe</MenuItem>
                <MenuItem value="with">Trouvé</MenuItem>
                <MenuItem value="without">Non trouvé</MenuItem>
              </TextField>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Si une initiative a plusieurs sites, c&apos;est le moins bon qui compte.
            </Typography>
          </Stack>
        </Box>
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
