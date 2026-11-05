import { Prisma } from '@etabli/src/generated/prisma/client';
import {
  InitiativeOrganizationSchema,
  InitiativeOrganizationSchemaType,
  OrganizationAncestorSchema,
  OrganizationAncestorSchemaType,
} from '@etabli/src/models/entities/organization';
import { prisma } from '@etabli/src/prisma';
import { formatOrganizationPath } from '@etabli/src/utils/organization';

// Read helpers are kept apart from the synchronization logic so they can be imported by pages and API routes
// without pulling server-only dependencies (the synchronization relies on the graceful shutdown helpers that import the LLM system)

// Retrieve organizations bound to initiatives with their full path so the interface can display them
export async function retrieveInitiativesOrganizations(
  initiativesIds: string[],
  client: Prisma.TransactionClient = prisma // To read within an open transaction (otherwise another connection would be needed)
): Promise<Map<string, InitiativeOrganizationSchemaType[]>> {
  const result = new Map<string, InitiativeOrganizationSchemaType[]>(initiativesIds.map((initiativeId) => [initiativeId, []]));

  if (initiativesIds.length === 0) {
    return result;
  }

  // Chunked since PostgreSQL limits the number of parameters of a query (and all initiatives can be requested at once)
  const bindings = [];
  const chunkSize = 10_000;
  for (let index = 0; index < initiativesIds.length; index += chunkSize) {
    bindings.push(
      ...(await client.organizationsOnInitiatives.findMany({
        where: {
          initiativeId: {
            in: initiativesIds.slice(index, index + chunkSize),
          },
        },
        select: {
          initiativeId: true,
          organization: {
            select: {
              id: true,
              name: true,
              acronym: true,
              level: true,
              directoryUrl: true,
              ancestorIds: true,
            },
          },
        },
      }))
    );
  }

  const ancestorsById = await retrieveOrganizationsAncestors(
    bindings.flatMap((binding) => binding.organization.ancestorIds),
    client
  );

  for (const binding of bindings) {
    result.get(binding.initiativeId)?.push(
      InitiativeOrganizationSchema.parse({
        id: binding.organization.id,
        name: binding.organization.name,
        acronym: binding.organization.acronym,
        level: binding.organization.level,
        directoryUrl: binding.organization.directoryUrl,
        ancestors: binding.organization.ancestorIds.flatMap((ancestorId) => {
          const ancestor = ancestorsById.get(ancestorId);

          return ancestor ? [ancestor] : [];
        }),
      })
    );
  }

  // Keep a stable order (by path) so the display does not change between requests
  for (const organizations of result.values()) {
    organizations.sort((a, b) => formatOrganizationPath(a).localeCompare(formatOrganizationPath(b), 'fr'));
  }

  return result;
}

export async function retrieveOrganizationsAncestors(
  ancestorsIds: string[],
  client: Prisma.TransactionClient = prisma
): Promise<Map<string, OrganizationAncestorSchemaType>> {
  const uniqueAncestorsIds = [...new Set(ancestorsIds)];

  if (uniqueAncestorsIds.length === 0) {
    return new Map();
  }

  const ancestors = await client.organization.findMany({
    where: {
      id: {
        in: uniqueAncestorsIds,
      },
    },
    select: {
      id: true,
      name: true,
      acronym: true,
    },
  });

  return new Map(ancestors.map((ancestor) => [ancestor.id, OrganizationAncestorSchema.parse(ancestor)]));
}
