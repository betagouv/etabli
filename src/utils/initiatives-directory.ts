import { createLoader, parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsString, parseAsStringLiteral } from 'nuqs/server';

import { PaginationSize } from '@etabli/src/models/actions/common';
import {
  InitiativesOrderSchema,
  ListInitiativesSchemaType,
  maximumFilteredOrganizations,
  maximumFilteredTools,
  maximumListPage,
  maximumSearchQueryLength,
} from '@etabli/src/models/actions/initiative';
import { FunctionalUseCaseSchema, GradeLetterSchema, LegalLinkPresenceSchema } from '@etabli/src/models/entities/initiative';
import { issueLevels } from '@etabli/src/utils/domain-security-issues';
import { mapColorModes } from '@etabli/src/utils/organizations-map';

// Shared by the directory page rendered by the server and its client component, so both ask exactly the same results
// (the browser then finds them in its cache instead of fetching them again)

// The directory can be read as a list, or as a map of the organizations using the same criteria
export const initiativesViews = ['list', 'map'] as const;

export const directoryParsers = {
  q: parseAsString.withDefault(''),
  fnc: parseAsArrayOf(parseAsStringLiteral(FunctionalUseCaseSchema.options)).withDefault([]),
  tools: parseAsArrayOf(parseAsString).withDefault([]),
  orgs: parseAsArrayOf(parseAsString).withDefault([]),
  nc: parseAsBoolean.withDefault(false),
  view: parseAsStringLiteral(initiativesViews).withDefault('list'),
  zoom: parseAsString, // Where the map is looking at, it never changes the criteria
  hasWeb: parseAsBoolean.withDefault(false),
  hasRepo: parseAsBoolean.withDefault(false),
  httpSec: parseAsArrayOf(parseAsStringLiteral(GradeLetterSchema.options)).withDefault([]),
  tls: parseAsArrayOf(parseAsStringLiteral(issueLevels)).withDefault([]),
  mail: parseAsArrayOf(parseAsStringLiteral(issueLevels)).withDefault([]),
  ml: parseAsStringLiteral(LegalLinkPresenceSchema.options),
  pc: parseAsStringLiteral(LegalLinkPresenceSchema.options),
  foreign: parseAsArrayOf(parseAsInteger).withDefault([]),
  color: parseAsStringLiteral(mapColorModes).withDefault('composition'),
  sort: parseAsStringLiteral(InitiativesOrderSchema.options).withDefault('relevance'),
  page: parseAsInteger.withDefault(1),
};

export const loadDirectoryParams = createLoader(directoryParsers);

export type DirectoryParams = Awaited<ReturnType<typeof loadDirectoryParams>>;

export const defaultDirectoryPageSize = PaginationSize.size10;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const organizationIdPattern = uuidPattern;

// Only valid identifiers are sent to the API (the URL can be modified by hand)
export function getDirectoryOrganizationIds(organizationIds: string[]): string[] {
  return organizationIds.filter((organizationId) => organizationIdPattern.test(organizationId)).slice(0, maximumFilteredOrganizations);
}

export function buildDirectoryFilterBy(params: DirectoryParams, organizationIds: string[]): ListInitiativesSchemaType['filterBy'] {
  const hasSearchQuery = params.q.trim().length > 0;
  // The URL can be modified by hand, it is bounded like the API expects instead of making the page fail
  const toolIds = params.tools.filter((toolId) => uuidPattern.test(toolId)).slice(0, maximumFilteredTools);
  const foreignDependencyLevels = [...new Set(params.foreign)].filter((level) => level >= 0 && level <= 3);

  return {
    query: hasSearchQuery ? params.q.slice(0, maximumSearchQueryLength) : null,
    functionalUseCases: params.fnc.length > 0 ? [...new Set(params.fnc)] : undefined,
    toolIds: toolIds.length > 0 ? toolIds : undefined,
    organizationIds: organizationIds.length > 0 ? organizationIds : undefined,
    unclassified: params.nc || undefined,
    hasWebsite: params.hasWeb || undefined,
    hasRepository: params.hasRepo || undefined,
    httpSecurityGrades: params.httpSec.length > 0 ? [...new Set(params.httpSec)] : undefined,
    tlsLevels: params.tls.length > 0 ? [...new Set(params.tls)] : undefined,
    mailSecurityLevels: params.mail.length > 0 ? [...new Set(params.mail)] : undefined,
    legalNotice: params.ml ?? undefined,
    privacyPolicy: params.pc ?? undefined,
    foreignDependencyLevels: foreignDependencyLevels.length > 0 ? foreignDependencyLevels : undefined,
  };
}

export function buildListInitiativesInput(params: DirectoryParams, organizationIds: string[], pageSize: PaginationSize): ListInitiativesSchemaType {
  return {
    page: Math.min(Math.max(params.page, 1), maximumListPage),
    pageSize: pageSize,
    orderBy: { field: params.sort },
    filterBy: buildDirectoryFilterBy(params, organizationIds),
  };
}
