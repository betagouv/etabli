import { randomUUID } from 'crypto';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { gunzipSync } from 'zlib';
import z from 'zod';

import { downloadFile } from '@etabli/src/common';
import { addEducationWebsitesToRectorates } from '@etabli/src/features/education';
import {
  MatchableOrganization,
  OrganizationMatcher,
  additionalOrganizationDomains,
  additionalRepositoryOrganizations,
  assertSafeOrganizationsRemoval,
  assertUsableOrganizationsDirectory,
  extractOrganizationDomain,
  getWebsiteOwnerPriority,
} from '@etabli/src/features/organization-matching';
import {
  CommuneWebsiteMatcher,
  attachCommunesToIntercommunalities,
  attachStandaloneOrganizationsToTerritories,
  parseOfficialCommunes,
} from '@etabli/src/features/territory';
import { Prisma } from '@etabli/src/generated/prisma/client';
import { HttpUrlSchema, LiteOrganizationSchema, LiteOrganizationSchemaType } from '@etabli/src/models/entities/organization';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { formatDiffResultLog, getDiff } from '@etabli/src/utils/comparaison';

const __root_dirname = process.cwd();

// The "Annuaire de l'administration" from the DILA (https://lannuaire.service-public.gouv.fr)
// We select only needed fields to reduce the file size (~35MB instead of hundreds)
// Ref: https://api-lannuaire.service-public.gouv.fr/explore/dataset/api-lannuaire-administration/
export const latestRemoteJsonUrl =
  'https://api-lannuaire.service-public.gouv.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json?select=id,nom,sigle,hierarchie,site_internet,url_service_public,pivot';
export const localJsonPath = path.resolve(__root_dirname, './data/dila-organizations.json');

// We only need the establishments having a website, it reduces the file a lot
export const latestRemoteEducationJsonUrl =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/exports/json?select=web,libelle_academie,ministere_tutelle&where=web%20is%20not%20null';
export const localEducationJsonPath = path.resolve(__root_dirname, './data/education-establishments.json');

// The "Données de la Présence Numérique des Territoires" from the ANCT (https://www.data.gouv.fr/datasets/donnees-de-la-presence-numerique-des-territoires)
export const latestRemoteCommunesUrl = 'https://www.data.gouv.fr/api/1/datasets/r/fd73a12f-572c-4b04-89e9-91cc8c6ebcb3';
export const localCommunesJsonPath = path.resolve(__root_dirname, './data/dpnt-quotidien.json.gz');

// Some fields are provided as stringified JSON
function parseStringifiedJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return undefined; // Let the schema report it as invalid for this record only
  }
}

export const JsonOrganizationSchema = z.object({
  id: z.string().uuid(),
  nom: z.string(),
  sigle: z.string().nullish(),
  hierarchie: z.preprocess(
    parseStringifiedJson,
    z
      .array(
        z.object({
          type_hierarchie: z.string(),
          service: z.string().uuid(),
        })
      )
      .nullish()
  ),
  site_internet: z.preprocess(
    parseStringifiedJson,
    z
      .array(
        z.object({
          valeur: z.string().nullish(),
        })
      )
      .nullish()
  ),
  url_service_public: HttpUrlSchema.nullish().catch(null), // Not essential, an invalid one should not exclude the organization
  pivot: z.preprocess(
    parseStringifiedJson,
    z
      .array(
        z.object({
          type_service_local: z.string().nullish(),
          code_insee_commune: z.array(z.string()).nullish(),
        })
      )
      .nullish()
  ),
});
export type JsonOrganizationSchemaType = z.infer<typeof JsonOrganizationSchema>;

export async function saveOrganizationListFile(cache = true) {
  if (!cache || !fsSync.existsSync(localJsonPath)) {
    await downloadFile(latestRemoteJsonUrl, localJsonPath, minutesToMilliseconds(10));
  }

  if (!cache || !fsSync.existsSync(localEducationJsonPath)) {
    await downloadFile(latestRemoteEducationJsonUrl, localEducationJsonPath, minutesToMilliseconds(5));
  }

  if (!cache || !fsSync.existsSync(localCommunesJsonPath)) {
    await downloadFile(latestRemoteCommunesUrl, localCommunesJsonPath, minutesToMilliseconds(5));
  }
}

export function parseOrganizations(records: unknown[]): Map<LiteOrganizationSchemaType['dilaId'], LiteOrganizationSchemaType> {
  const jsonOrganizations = new Map<string, JsonOrganizationSchemaType>();
  // The directory is maintained by many contributors, a malformed record must not prevent synchronizing all the others
  let invalidRecordsCount = 0;
  for (const record of records) {
    const result = JsonOrganizationSchema.safeParse(record);

    if (!result.success) {
      invalidRecordsCount++;
      continue;
    }

    if (result.data.nom.trim() !== '') {
      jsonOrganizations.set(result.data.id, result.data);
    }
  }

  assertUsableOrganizationsDirectory(records.length, invalidRecordsCount);

  if (invalidRecordsCount > 0) {
    console.warn(`${invalidRecordsCount} organizations of the directory are malformed and have been skipped`);
  }

  // The dataset lists children of each organization whereas we store the unique parent of each organization
  // Note: we only look at the descendant hierarchy, the other type ("Autre hiérarchie") is not explained in their documentation
  // Ref: https://echanges.dila.gouv.fr/OPENDATA/RefOrgaAdminEtat/Documentation/Sp%C3%A9cifications-datagouv-r%C3%A9f%C3%A9rentiel-organisation-administrative-de-l-Etat_V1.1.pdf
  const parentDilaIdByChildDilaId = new Map<string, string>();
  let ignoredSecondParentsCount = 0;
  for (const jsonOrganization of jsonOrganizations.values()) {
    for (const hierarchy of jsonOrganization.hierarchie || []) {
      // Some children are referenced whereas they are not listed in the dataset
      if (hierarchy.type_hierarchie !== 'Service Fils' || !jsonOrganizations.has(hierarchy.service) || hierarchy.service === jsonOrganization.id) {
        continue;
      }

      if (parentDilaIdByChildDilaId.has(hierarchy.service)) {
        ignoredSecondParentsCount++;
      } else {
        parentDilaIdByChildDilaId.set(hierarchy.service, jsonOrganization.id);
      }
    }
  }

  if (ignoredSecondParentsCount > 0) {
    console.warn(`${ignoredSecondParentsCount} organizations have multiple parents in the directory, only the first one has been kept`);
  }

  const getAncestorDilaIds = (dilaId: string): string[] => {
    const ancestorDilaIds: string[] = [];

    let currentParentDilaId = parentDilaIdByChildDilaId.get(dilaId);
    while (currentParentDilaId) {
      // Prevent infinite loops in case of a cycle in the dataset
      if (currentParentDilaId === dilaId || ancestorDilaIds.includes(currentParentDilaId)) {
        console.warn(`the organization "${dilaId}" is part of a hierarchy cycle, its ancestors have been truncated`);
        break;
      }

      ancestorDilaIds.unshift(currentParentDilaId);
      currentParentDilaId = parentDilaIdByChildDilaId.get(currentParentDilaId);
    }

    return ancestorDilaIds;
  };

  const liteOrganizations = new Map<LiteOrganizationSchemaType['dilaId'], LiteOrganizationSchemaType>();
  for (const jsonOrganization of jsonOrganizations.values()) {
    const ancestorDilaIds = getAncestorDilaIds(jsonOrganization.id);
    const domains = new Set<string>();

    for (const website of jsonOrganization.site_internet || []) {
      const domain = website.valeur ? extractOrganizationDomain(website.valeur) : null;

      if (domain) {
        domains.add(domain);
      }
    }

    liteOrganizations.set(
      jsonOrganization.id,
      LiteOrganizationSchema.parse({
        dilaId: jsonOrganization.id,
        // In case of a truncated cycle the parent is the last kept ancestor
        parentDilaId: ancestorDilaIds.length > 0 ? ancestorDilaIds[ancestorDilaIds.length - 1] : null,
        ancestorDilaIds: ancestorDilaIds,
        level: ancestorDilaIds.length + 1,
        name: jsonOrganization.nom.trim(),
        acronym: jsonOrganization.sigle?.trim() || null,
        domains: [...domains].sort(),
        directoryUrl: jsonOrganization.url_service_public || null,
        localServiceType: jsonOrganization.pivot?.find((pivot) => !!pivot.type_service_local)?.type_service_local || null,
        isTerritorial: false,
      })
    );
  }

  const inseeCodeByDilaId = new Map<string, string>();
  for (const jsonOrganization of jsonOrganizations.values()) {
    const inseeCode = jsonOrganization.pivot?.find((pivot) => !!pivot.code_insee_commune?.length)?.code_insee_commune?.[0];

    if (inseeCode) {
      inseeCodeByDilaId.set(jsonOrganization.id, inseeCode);
    }
  }

  attachStandaloneOrganizationsToTerritories(liteOrganizations, inseeCodeByDilaId);

  return liteOrganizations;
}

export async function readOfficialCommunesRecords(): Promise<unknown[]> {
  return JSON.parse(gunzipSync(new Uint8Array(await fs.readFile(localCommunesJsonPath))).toString('utf-8'));
}

export async function formatOrganizationsIntoDatabase() {
  const content = await fs.readFile(localJsonPath, 'utf-8');
  const records: unknown[] = JSON.parse(content);

  const jsonLiteOrganizations = parseOrganizations(records);
  addEducationWebsitesToRectorates(jsonLiteOrganizations, JSON.parse(await fs.readFile(localEducationJsonPath, 'utf-8')));
  attachCommunesToIntercommunalities(jsonLiteOrganizations, await readOfficialCommunesRecords());

  await synchronizeOrganizations(jsonLiteOrganizations);
}

export async function synchronizeOrganizations(jsonLiteOrganizations: Map<LiteOrganizationSchemaType['dilaId'], LiteOrganizationSchemaType>) {
  const displayChangedOrganizationsIds: string[] = [];

  await prisma.$transaction(
    async (tx) => {
      const storedOrganizations = await tx.organization.findMany({
        select: {
          id: true,
          dilaId: true,
          parentOrganizationId: true,
          ancestorIds: true,
          level: true,
          name: true,
          acronym: true,
          domains: true,
          directoryUrl: true,
          localServiceType: true,
          isTerritorial: true,
        },
      });

      // The tree is stored with our own identifiers, so we keep the mapping to compare and to link new organizations
      const idByDilaId = new Map<string, string>();
      const dilaIdById = new Map<string, string>();
      for (const storedOrganization of storedOrganizations) {
        idByDilaId.set(storedOrganization.dilaId, storedOrganization.id);
        dilaIdById.set(storedOrganization.id, storedOrganization.dilaId);
      }

      const toDilaId = (id: string): string => {
        const dilaId = dilaIdById.get(id);
        if (!dilaId) {
          throw new Error(`the stored organization "${id}" should be part of the mapping`);
        }

        return dilaId;
      };

      // To make the diff we compare only meaningful properties
      const storedLiteOrganizations: typeof jsonLiteOrganizations = new Map();
      for (const storedOrganization of storedOrganizations) {
        storedLiteOrganizations.set(
          storedOrganization.dilaId,
          LiteOrganizationSchema.parse({
            dilaId: storedOrganization.dilaId,
            parentDilaId: storedOrganization.parentOrganizationId ? toDilaId(storedOrganization.parentOrganizationId) : null,
            ancestorDilaIds: storedOrganization.ancestorIds.map(toDilaId),
            level: storedOrganization.level,
            name: storedOrganization.name,
            acronym: storedOrganization.acronym,
            domains: storedOrganization.domains,
            directoryUrl: storedOrganization.directoryUrl,
            localServiceType: storedOrganization.localServiceType,
            isTerritorial: storedOrganization.isTerritorial,
          })
        );
      }

      const diffResult = getDiff(storedLiteOrganizations, jsonLiteOrganizations);

      console.log(`synchronizing organizations into the database (${formatDiffResultLog(diffResult)})`);

      assertSafeOrganizationsRemoval(storedOrganizations.length, diffResult.removed.length);

      // New organizations get their identifier right now so children can reference their parent within the same bulk insert
      for (const addedLiteOrganization of diffResult.added) {
        idByDilaId.set(addedLiteOrganization.dilaId, randomUUID());
      }

      const toId = (dilaId: string): string => {
        const id = idByDilaId.get(dilaId);
        if (!id) {
          throw new Error(`the organization "${dilaId}" should be part of the mapping`);
        }

        return id;
      };

      // Bindings to initiatives are removed by cascade, so their initiatives are marked as updated first since their sheet (and LLM document)
      // changes, even if no other organization replaces the removed one. Children get their new parent below as an update
      const removedIds = diffResult.removed.map((removedLiteOrganization) => toId(removedLiteOrganization.dilaId));
      const removalChunkSize = 5_000;
      for (let index = 0; index < removedIds.length; index += removalChunkSize) {
        const removedIdsChunk = removedIds.slice(index, index + removalChunkSize);

        await tx.initiative.updateMany({
          where: {
            OrganizationsOnInitiatives: {
              some: {
                organizationId: {
                  in: removedIdsChunk,
                },
              },
            },
          },
          data: {
            updatedAt: new Date(),
          },
        });

        await tx.organization.deleteMany({
          where: {
            id: {
              in: removedIdsChunk,
            },
          },
        });
      }

      // Parents are created first so the foreign key is always satisfied
      const sortedOrganizationsToAdd = [...diffResult.added].sort((a, b) => a.level - b.level);
      const creationChunkSize = 5_000;
      for (let index = 0; index < sortedOrganizationsToAdd.length; index += creationChunkSize) {
        watchGracefulExitInLoop();

        await tx.organization.createMany({
          data: sortedOrganizationsToAdd.slice(index, index + creationChunkSize).map((addedLiteOrganization) => ({
            id: toId(addedLiteOrganization.dilaId),
            dilaId: addedLiteOrganization.dilaId,
            parentOrganizationId: addedLiteOrganization.parentDilaId ? toId(addedLiteOrganization.parentDilaId) : null,
            ancestorIds: addedLiteOrganization.ancestorDilaIds.map(toId),
            level: addedLiteOrganization.level,
            name: addedLiteOrganization.name,
            acronym: addedLiteOrganization.acronym,
            domains: addedLiteOrganization.domains,
            directoryUrl: addedLiteOrganization.directoryUrl,
            localServiceType: addedLiteOrganization.localServiceType,
            isTerritorial: addedLiteOrganization.isTerritorial,
          })),
        });
      }

      // Bound initiatives display the whole path, so they must be refreshed when an organization of it is renamed or moved
      for (const updatedLiteOrganization of diffResult.updated) {
        const storedLiteOrganization = storedLiteOrganizations.get(updatedLiteOrganization.dilaId);

        if (
          !storedLiteOrganization ||
          storedLiteOrganization.name !== updatedLiteOrganization.name ||
          storedLiteOrganization.acronym !== updatedLiteOrganization.acronym ||
          storedLiteOrganization.ancestorDilaIds.join() !== updatedLiteOrganization.ancestorDilaIds.join()
        ) {
          displayChangedOrganizationsIds.push(toId(updatedLiteOrganization.dilaId));
        }
      }

      for (const updatedLiteOrganization of diffResult.updated) {
        watchGracefulExitInLoop();

        await tx.organization.update({
          where: {
            dilaId: updatedLiteOrganization.dilaId,
          },
          data: {
            parentOrganizationId: updatedLiteOrganization.parentDilaId ? toId(updatedLiteOrganization.parentDilaId) : null,
            ancestorIds: updatedLiteOrganization.ancestorDilaIds.map(toId),
            level: updatedLiteOrganization.level,
            name: updatedLiteOrganization.name,
            acronym: updatedLiteOrganization.acronym,
            domains: updatedLiteOrganization.domains,
            directoryUrl: updatedLiteOrganization.directoryUrl,
            localServiceType: updatedLiteOrganization.localServiceType,
            isTerritorial: updatedLiteOrganization.isTerritorial,
          },
          select: {
            id: true, // Ref: https://github.com/prisma/prisma/issues/6252
          },
        });
      }

      if (displayChangedOrganizationsIds.length > 0) {
        // Initiatives bound to a renamed/moved organization or to one of its descendants have their sheet (and LLM document) changed
        const touchedInitiativesCount = await tx.$executeRaw`
          UPDATE "Initiative" i
          SET "updatedAt" = now()
          WHERE EXISTS (
            SELECT 1
            FROM "OrganizationsOnInitiatives" oi
            JOIN "Organization" o ON o."id" = oi."organizationId"
            WHERE oi."initiativeId" = i."id"
              AND (o."id" = ANY(${displayChangedOrganizationsIds}::uuid[]) OR o."ancestorIds" && ${displayChangedOrganizationsIds}::uuid[])
          )
        `;

        console.log(`${touchedInitiativesCount} initiatives are marked as updated since organizations of their path have been renamed or moved`);
      }
    },
    {
      timeout: minutesToMilliseconds(process.env.NODE_ENV !== 'production' ? 20 : 10), // Since dealing with a lot of data, prevent closing whereas everything is alright
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

export async function buildOrganizationMatcher(): Promise<OrganizationMatcher | null> {
  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      dilaId: true,
      parentOrganizationId: true,
      ancestorIds: true,
      level: true,
      domains: true,
      name: true,
      localServiceType: true,
      isTerritorial: true,
    },
  });

  if (organizations.length === 0) {
    return null;
  }

  const parentsIds = new Set<string>();
  const idByDilaId = new Map<string, string>();
  for (const organization of organizations) {
    idByDilaId.set(organization.dilaId, organization.id);

    if (organization.parentOrganizationId && !organization.isTerritorial) {
      parentsIds.add(organization.parentOrganizationId);
    }
  }

  // Being located in a department does not make it part of a hierarchy, rules about who owns a website must ignore it
  const matchableOrganizations: MatchableOrganization[] = organizations.map((organization) => ({
    id: organization.id,
    ancestorIds: organization.isTerritorial ? [] : organization.ancestorIds,
    level: organization.isTerritorial ? 1 : organization.level,
    hasChildren: parentsIds.has(organization.id),
    domains: [...organization.domains, ...(additionalOrganizationDomains[organization.dilaId] ?? [])],
    websiteOwnerPriority: getWebsiteOwnerPriority(organization),
  }));

  const repositoryOrganizations = [
    ...(await prisma.repositoryOrganization.findMany({
      select: {
        url: true,
        dilaId: true,
      },
    })),
    ...additionalRepositoryOrganizations,
  ];

  let unknownRepositoryOrganizationsCount = 0;
  const matchableRepositoryOrganizations = repositoryOrganizations.flatMap((repositoryOrganization) => {
    const organizationId = repositoryOrganization.dilaId ? idByDilaId.get(repositoryOrganization.dilaId) : undefined;

    if (!organizationId) {
      unknownRepositoryOrganizationsCount++;

      return [];
    }

    return [{ url: repositoryOrganization.url, organizationId: organizationId }];
  });

  if (unknownRepositoryOrganizationsCount > 0) {
    console.log(
      `${unknownRepositoryOrganizationsCount} repository organizations reference an organization missing from the directory, they are skipped`
    );
  }

  return new OrganizationMatcher(matchableOrganizations, matchableRepositoryOrganizations);
}

export async function bindOrganizationsToInitiatives() {
  const matcher = await buildOrganizationMatcher();
  if (!matcher) {
    throw new Error('organizations must be retrieved before binding them to initiatives');
  }

  const communeWebsiteMatcher = new CommuneWebsiteMatcher(parseOfficialCommunes(await readOfficialCommunesRecords()));
  const organizationIdByDilaId = new Map(
    (await prisma.organization.findMany({ where: { isTerritorial: true }, select: { id: true, dilaId: true } })).map((organization) => [
      organization.dilaId,
      organization.id,
    ])
  );
  const websiteTitleByDomain = new Map(
    (await prisma.rawDomain.findMany({ select: { name: true, websiteTitle: true, websiteInferredName: true } })).map((rawDomain) => [
      rawDomain.name,
      rawDomain.websiteTitle ?? rawDomain.websiteInferredName,
    ])
  );

  const initiatives = await prisma.initiative.findMany({
    select: {
      id: true,
      websites: true,
      repositories: true,
      OrganizationsOnInitiatives: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  const changedBindings: { initiativeId: string; organizationsIds: string[] }[] = [];
  let boundInitiativesCount = 0;
  for (const initiative of initiatives) {
    const organizationsIds = matcher.matchInitiative(initiative);

    // When nothing is known about the website, it may still be the one of a commune
    if (organizationsIds.length === 0 && initiative.websites.length > 0) {
      const website = initiative.websites[0];
      const commune = communeWebsiteMatcher.match(website, websiteTitleByDomain.get(new URL(website).hostname) ?? null);
      const organizationId = commune ? organizationIdByDilaId.get(commune.dilaId) : undefined;

      if (organizationId) {
        organizationsIds.push(organizationId);
      }
    }

    const currentOrganizationsIds = initiative.OrganizationsOnInitiatives.map((binding) => binding.organizationId).sort();

    if (organizationsIds.length > 0) {
      boundInitiativesCount++;
    }

    if (organizationsIds.join() !== currentOrganizationsIds.join()) {
      changedBindings.push({ initiativeId: initiative.id, organizationsIds: organizationsIds });
    }
  }

  console.log(
    `${boundInitiativesCount}/${initiatives.length} initiatives are bound to at least one organization, ${changedBindings.length} of them have their bindings changed`
  );

  const chunkSize = 1_000;
  for (let index = 0; index < changedBindings.length; index += chunkSize) {
    watchGracefulExitInLoop();

    const chunk = changedBindings.slice(index, index + chunkSize);
    const initiativesIds = chunk.map((changedBinding) => changedBinding.initiativeId);

    await prisma.$transaction([
      prisma.organizationsOnInitiatives.deleteMany({
        where: {
          initiativeId: {
            in: initiativesIds,
          },
        },
      }),
      prisma.organizationsOnInitiatives.createMany({
        data: chunk.flatMap((changedBinding) =>
          changedBinding.organizationsIds.map((organizationId) => ({
            initiativeId: changedBinding.initiativeId,
            organizationId: organizationId,
          }))
        ),
      }),
      // Organizations are part of the initiative sheet (and of its LLM document that needs to be recomputed)
      prisma.initiative.updateMany({
        where: {
          id: {
            in: initiativesIds,
          },
        },
        data: {
          updatedAt: new Date(),
        },
      }),
    ]);
  }

  await updateOrganizationsInitiativesCount();
}

// Count for each organization the initiatives bound to it or to any of its descendants,
// so the interface can only propose organizations having initiatives
export async function updateOrganizationsInitiativesCount() {
  const updatedCount = await prisma.$executeRaw`
    WITH counts AS (
      SELECT target.id AS id, COUNT(DISTINCT oi."initiativeId")::int AS count
      FROM "OrganizationsOnInitiatives" oi
      JOIN "Initiative" i ON i."id" = oi."initiativeId" AND i."deletedAt" IS NULL
      JOIN "Organization" bound ON bound."id" = oi."organizationId"
      CROSS JOIN LATERAL unnest(array_append(bound."ancestorIds", bound."id")) AS target(id)
      GROUP BY target.id
    )
    UPDATE "Organization" o
    SET "initiativesCount" = COALESCE(counts.count, 0), "updatedAt" = now()
    FROM "Organization" source
    LEFT JOIN counts ON counts.id = source."id"
    WHERE o."id" = source."id" AND o."initiativesCount" IS DISTINCT FROM COALESCE(counts.count, 0)
  `;

  console.log(`the initiatives count has been updated for ${updatedCount} organizations`);
}
