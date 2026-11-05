'use client';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useId, useMemo, useRef, useState } from 'react';
import { useDebounce } from 'react-use';

import { trpc } from '@etabli/src/client/trpcClient';
import { standaloneOrganizationsNodeId } from '@etabli/src/models/actions/initiative';
import { OrganizationOptionSchemaType } from '@etabli/src/models/entities/organization';
import { SUMMARY_ORGANIZATION_LEVEL, organizationPathSeparator } from '@etabli/src/utils/organization';

export function formatOrganizationOptionContext(organization: Pick<OrganizationOptionSchemaType, 'ancestors'>): string | null {
  // The first levels of the directory are generic categories, they would make the context harder to read
  const meaningfulAncestors = organization.ancestors.slice(SUMMARY_ORGANIZATION_LEVEL - 1);

  return meaningfulAncestors.length > 0 ? meaningfulAncestors.map((ancestor) => ancestor.name).join(organizationPathSeparator) : null;
}

// Teams without initiatives lead to the organization their initiatives are bound to, so users must know why it is proposed
export function formatMatchedThrough(names: string[] | undefined): string | null {
  if (!names || names.length === 0) {
    return null;
  }

  const othersCount = names.length - 1;
  const matchedOrganizations = `« ${names[0]} »${othersCount > 0 ? ` et ${othersCount} autre${othersCount > 1 ? 's' : ''}` : ''}`;

  return `Inclut ${matchedOrganizations} : les initiatives sont rattachées ici`;
}

export interface OrganizationPickerValue {
  organizationIds: string[];
  unclassified: boolean;
}

interface SelectionProps {
  selectedIds: Set<string>;
  onToggle: (organization: OrganizationOptionSchemaType, checked: boolean) => void;
}

const indentationStep = 24;
const pageSize = 50;

function formatCount(count: number): string {
  return count.toLocaleString('fr-FR');
}

interface PickerRowProps {
  depth: number;
  label: string;
  secondary?: string | null;
  explanation?: string | null; // Why this row is listed when it does not look like what has been searched
  count?: number | null;
  countUnit?: string;
  checked?: boolean;
  includedBy?: string | null; // Name of the selected ancestor including this row
  onCheck?: (checked: boolean) => void;
  expandable?: boolean;
  expanded?: boolean;
  onExpand?: () => void;
  muted?: boolean;
  children?: React.ReactNode; // The group of children when expanded (it must be inside the tree item for assistive technologies)
}

function PickerRow(props: PickerRowProps) {
  const labelId = useId();
  const isIncluded = !!props.includedBy;

  return (
    <div
      role="treeitem"
      aria-expanded={props.expandable ? props.expanded : undefined}
      aria-selected={props.onCheck ? props.checked || isIncluded : undefined}
      aria-labelledby={labelId}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          pl: `${8 + props.depth * indentationStep}px`,
          pr: 2,
          py: 1,
          minHeight: 44,
          '&:hover': { bgcolor: 'var(--background-default-grey-hover)' },
        }}
      >
        <Box sx={{ width: 28, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          {props.expandable && (
            <IconButton size="small" onClick={props.onExpand} aria-label={`${props.expanded ? 'Replier' : 'Déplier'} « ${props.label} »`}>
              {props.expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
            </IconButton>
          )}
        </Box>
        {props.onCheck && (
          <Checkbox
            checked={!!props.checked || isIncluded}
            disabled={isIncluded}
            onChange={(event) => props.onCheck?.(event.target.checked)}
            inputProps={{ 'aria-labelledby': labelId }}
            sx={{ p: 0.75 }}
          />
        )}
        <Box
          id={labelId}
          onClick={props.onCheck ? (isIncluded ? undefined : () => props.onCheck?.(!props.checked)) : props.onExpand}
          sx={{ flex: 1, minWidth: 0, pl: 1, cursor: isIncluded ? 'default' : 'pointer', userSelect: 'none' }}
        >
          <Typography variant="body2" sx={{ color: props.muted || isIncluded ? 'text.secondary' : 'text.primary' }}>
            {props.label}
          </Typography>
          {(props.secondary || isIncluded) && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.35 }}>
              {isIncluded ? `Incluse via « ${props.includedBy} »` : props.secondary}
            </Typography>
          )}
          {props.explanation && (
            <Typography
              variant="caption"
              component="div"
              // A different color since it is the exception that needs to be noticed, direct results do not have one
              sx={{ display: 'flex', alignItems: 'flex-start', gap: '6px', mt: 0.25, lineHeight: 1.35, color: 'var(--text-default-info)' }}
            >
              <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 14, mt: '1px', flexShrink: 0 }} />
              <span>{props.explanation}</span>
            </Typography>
          )}
        </Box>
        {props.count != null && (
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, textAlign: 'right', minWidth: 48 }} title={props.countUnit}>
            {formatCount(props.count)}
          </Typography>
        )}
      </Box>
      {props.children}
    </div>
  );
}

// Children of a node are fetched page by page, only once the node is expanded
function OrganizationChildren(props: SelectionProps & { parentId: string | null; depth: number; includedBy: string | null }) {
  const [pagesCount, setPagesCount] = useState(1);

  return (
    // At the top level items belong directly to the tree
    <div role={props.parentId === null ? 'none' : 'group'}>
      {Array.from({ length: pagesCount }, (_, pageIndex) => (
        <OrganizationChildrenPage
          key={pageIndex}
          {...props}
          offset={pageIndex * pageSize}
          isLastPage={pageIndex === pagesCount - 1}
          onLoadMore={() => setPagesCount((count) => count + 1)}
        />
      ))}
    </div>
  );
}

function OrganizationChildrenPage(
  props: SelectionProps & {
    parentId: string | null;
    depth: number;
    includedBy: string | null;
    offset: number;
    isLastPage: boolean;
    onLoadMore: () => void;
  }
) {
  const { data, isLoading } = trpc.listOrganizationChildren.useQuery({ parentId: props.parentId, offset: props.offset });

  if (isLoading || !data) {
    return (
      // Only tree items are allowed in a tree, so the loading indicator is one
      <Box role="treeitem" aria-label="chargement" aria-busy="true" sx={{ pl: `${44 + props.depth * indentationStep}px`, py: 1.5 }}>
        <CircularProgress size={16} aria-hidden="true" />
      </Box>
    );
  }

  const remaining = data.total - (props.offset + data.organizations.length);

  return (
    <>
      {data.organizations.map((organization) => (
        <OrganizationNode key={organization.id} {...props} organization={organization} hasChildren={organization.hasChildren} />
      ))}
      {props.parentId === null && !!data.standaloneOrganizationsCount && (
        <StandaloneOrganizationsNode {...props} count={data.standaloneOrganizationsCount} />
      )}
      {props.isLastPage && remaining > 0 && (
        <Box role="treeitem" aria-label="afficher plus d'organisations" sx={{ pl: `${44 + props.depth * indentationStep}px`, py: 0.5 }}>
          <Button size="small" onClick={props.onLoadMore}>
            Afficher {Math.min(remaining, data.pageSize)} de plus ({remaining.toLocaleString('fr-FR')} restantes)
          </Button>
        </Box>
      )}
    </>
  );
}

function StandaloneOrganizationsNode(props: SelectionProps & { depth: number; count: number; includedBy: string | null }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <PickerRow
      depth={props.depth}
      label="Organisations hors hiérarchie"
      secondary="Mairies, services locaux… sans administration de rattachement dans l'annuaire"
      count={props.count}
      countUnit="organisations"
      expandable
      expanded={expanded}
      onExpand={() => setExpanded(!expanded)}
      muted
    >
      {expanded && <OrganizationChildren {...props} parentId={standaloneOrganizationsNodeId} depth={props.depth + 1} />}
    </PickerRow>
  );
}

function OrganizationNode(
  props: SelectionProps & { organization: OrganizationOptionSchemaType; hasChildren: boolean; depth: number; includedBy: string | null }
) {
  const [expanded, setExpanded] = useState(false);
  const isSelected = props.selectedIds.has(props.organization.id);

  return (
    <PickerRow
      depth={props.depth}
      label={props.organization.name}
      count={props.organization.initiativesCount}
      countUnit="initiatives"
      checked={isSelected}
      includedBy={props.includedBy}
      onCheck={(checked) => props.onToggle(props.organization, checked)}
      expandable={props.hasChildren}
      expanded={expanded}
      onExpand={() => setExpanded(!expanded)}
      muted={props.organization.level < SUMMARY_ORGANIZATION_LEVEL}
    >
      {expanded && (
        <OrganizationChildren
          {...props}
          parentId={props.organization.id}
          depth={props.depth + 1}
          includedBy={props.includedBy ?? (isSelected ? props.organization.name : null)}
        />
      )}
    </PickerRow>
  );
}

export interface OrganizationPickerProps {
  value: OrganizationPickerValue;
  onChange: (value: OrganizationPickerValue) => void;
  enabled?: boolean;
}

export function OrganizationPicker(props: OrganizationPickerProps) {
  const enabled = props.enabled ?? true;
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useDebounce(() => setDebouncedQuery(inputValue.trim()), 300, [inputValue]);

  const searchOrganizations = trpc.searchOrganizations.useQuery(
    { query: debouncedQuery },
    { enabled: enabled && debouncedQuery !== '', keepPreviousData: true }
  );

  const rootChildren = trpc.listOrganizationChildren.useQuery({ parentId: null, offset: 0 }, { enabled: enabled });

  // Selected organizations may not be visible in the tree or the search results (e.g. coming from the URL)
  const getOrganizations = trpc.getOrganizations.useQuery(
    { ids: props.value.organizationIds },
    { enabled: enabled && props.value.organizationIds.length > 0, keepPreviousData: true }
  );

  // Remember organizations seen anywhere so the selection can always be displayed and compared
  const knownOrganizations = useRef(new Map<string, OrganizationOptionSchemaType>());
  for (const organization of getOrganizations.data?.organizations || []) {
    knownOrganizations.current.set(organization.id, organization);
  }

  const selectedIds = useMemo(() => new Set(props.value.organizationIds), [props.value.organizationIds]);

  const onToggle = (organization: OrganizationOptionSchemaType, checked: boolean) => {
    knownOrganizations.current.set(organization.id, organization);

    let organizationIds: string[];
    if (checked) {
      // Descendants already selected are now included through this organization
      organizationIds = [
        ...props.value.organizationIds.filter((organizationId) => {
          const selectedOrganization = knownOrganizations.current.get(organizationId);

          return !selectedOrganization?.ancestors.some((ancestor) => ancestor.id === organization.id);
        }),
        organization.id,
      ];
    } else {
      organizationIds = props.value.organizationIds.filter((organizationId) => organizationId !== organization.id);
    }

    props.onChange({ ...props.value, organizationIds: organizationIds });
  };

  const isSearching = debouncedQuery !== '';

  return (
    <Box>
      <TextField
        fullWidth
        label="Organisations"
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        placeholder="Rechercher un ministère, une direction, une mairie, un domaine…"
        InputLabelProps={{ shrink: true }}
        InputProps={{
          startAdornment: (
            <>
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
              {props.value.organizationIds.map((organizationId) => {
                const organization = knownOrganizations.current.get(organizationId);

                return (
                  <Chip
                    key={organizationId}
                    size="small"
                    label={organization?.name || '…'}
                    onDelete={() =>
                      onToggle(organization || ({ id: organizationId, ancestors: [] } as unknown as OrganizationOptionSchemaType), false)
                    }
                    sx={{ maxWidth: 260, m: '3px' }}
                  />
                );
              })}
              {props.value.unclassified && (
                <Chip size="small" label="Non classées" onDelete={() => props.onChange({ ...props.value, unclassified: false })} sx={{ m: '3px' }} />
              )}
            </>
          ),
          endAdornment: searchOrganizations.isFetching ? <CircularProgress size={16} /> : undefined,
          sx: { flexWrap: 'wrap', py: '6px', '& > input': { width: 'auto', flex: '1 1 160px', py: '10px' } },
        }}
      />
      <Box
        role="tree"
        aria-label="organisations"
        aria-multiselectable="true"
        sx={{
          mt: 1,
          maxHeight: 360,
          overflowY: 'auto',
          border: '1px solid var(--border-default-grey)',
          borderRadius: '4px',
          py: 0.5,
        }}
      >
        {isSearching ? (
          searchOrganizations.data && searchOrganizations.data.organizations.length === 0 ? (
            <Typography role="treeitem" aria-disabled="true" variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
              Aucune organisation avec des initiatives ne correspond.
            </Typography>
          ) : (
            (searchOrganizations.data?.organizations || []).map((organization) => {
              const selectedAncestor = organization.ancestors.find((ancestor) => selectedIds.has(ancestor.id));

              return (
                <PickerRow
                  key={organization.id}
                  depth={0}
                  label={organization.name}
                  secondary={formatOrganizationOptionContext(organization)}
                  explanation={formatMatchedThrough(searchOrganizations.data?.matchedThrough[organization.id])}
                  count={organization.initiativesCount}
                  countUnit="initiatives"
                  checked={selectedIds.has(organization.id)}
                  includedBy={selectedAncestor?.name}
                  onCheck={(checked) => onToggle(organization, checked)}
                />
              );
            })
          )
        ) : (
          <>
            <PickerRow
              depth={0}
              label="Initiatives non classées"
              secondary="Aucune organisation n'a été reconnue à partir de leurs sites et dépôts"
              count={rootChildren.data?.unclassifiedInitiativesCount}
              countUnit="initiatives"
              checked={props.value.unclassified}
              onCheck={(checked) => props.onChange({ ...props.value, unclassified: checked })}
              muted
            />
            <OrganizationChildren parentId={null} depth={0} includedBy={null} selectedIds={selectedIds} onToggle={onToggle} />
          </>
        )}
      </Box>
    </Box>
  );
}
