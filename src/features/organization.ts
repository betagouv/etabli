import { Prisma } from '@prisma/client';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import fsSync from 'fs';
import fs from 'fs/promises';
import linkifyit from 'linkify-it';
import path from 'path';
import z from 'zod';

import { downloadFile } from '@etabli/src/common';
import { LiteOrganizationSchema, LiteOrganizationSchemaType } from '@etabli/src/models/entities/organization';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { formatDiffResultLog, getDiff } from '@etabli/src/utils/comparaison';

const __root_dirname = process.cwd();
const linkify = linkifyit();

// We used their query parameters to reduce the output file and handle it at once in memory (reducing the size to ~10MB instead of 100+MB)
export const latestRemoteJsonUrl =
  'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json?lang=fr&timezone=Europe%2FBerlin&use_labels=true&delimiter=%3B&select=id,nom,hierarchie,site_internet';
export const localJsonPath = path.resolve(__root_dirname, './data/organizations.json');

export const JsonOrganizationSchema = z
  .object({
    id: z.string().uuid(),
    nom: z.string().min(1),
    hierarchie: z.preprocess(
      (v: any) => {
        // They pass it as a stringified object
        return JSON.parse(v);
      },
      z
        .array(
          z.object({
            type_hierarchie: z.literal('Service Fils').or(z.literal('Autre hiérarchie')),
            service: z.string().uuid(),
          })
        )
        .nullable()
    ),
    site_internet: z.preprocess(
      (v: any) => {
        // They pass it as a stringified object
        return JSON.parse(v);
      },
      z
        .array(
          z.object({
            libelle: z.string(),
            valeur: z.preprocess((v) => {
              // A few links are the missing protocol so using a specific library to handle this case
              const matches = linkify.match(v as string);

              return matches ? matches[0].url : null; // Some domains are invalid due to having "_" so we make sure to skip them into `.transform()`
            }, z.string().url().nullable()),
          })
        )
        .transform((items) => {
          return items.filter((items) => {
            return !!items.valeur;
          }) as (Omit<(typeof items)[0], 'valeur'> & { valeur: string })[]; // Adjust the type since we make sure no null URL will be present
        })
        .nullable()
    ),
  })
  .strict();
export type JsonOrganizationSchemaType = z.infer<typeof JsonOrganizationSchema>;

export async function saveOrganizationListFile(cache = true) {
  if (!cache || !fsSync.existsSync(localJsonPath)) {
    await downloadFile(latestRemoteJsonUrl, localJsonPath);
  }
}

export function retrieveNestedOrganizationLevel(
  organizations: Map<LiteOrganizationSchemaType['dilaId'], LiteOrganizationSchemaType>,
  currentOrganization: LiteOrganizationSchemaType,
  currentLevel: number = 1
) {
  if (!!currentOrganization.parentDilaId) {
    const parentOrganization = organizations.get(currentOrganization.parentDilaId);
    if (!parentOrganization) {
      throw new Error(`listed parent "${currentOrganization.parentDilaId}" should exist in the map`);
    }

    return retrieveNestedOrganizationLevel(organizations, parentOrganization, currentLevel + 1);
  }

  return currentLevel;
}

export async function formatOrganizationsIntoDatabase() {
  const content = await fs.readFile(localJsonPath, 'utf-8');
  const records: unknown[] = JSON.parse(content);
  const duplicatesMarkers: string[] = [];

  const jsonOrganizations = records
    .map((record: any) => {
      const jsonOrganization = JsonOrganizationSchema.parse(record);

      // We are just looking at descendant hierarchy, we are not aware of what is "other hierarchy" despite reading their documentation
      // Ref: https://echanges.dila.gouv.fr/OPENDATA/RefOrgaAdminEtat/Documentation/Sp%C3%A9cifications-datagouv-r%C3%A9f%C3%A9rentiel-organisation-administrative-de-l-Etat_V1.1.pdf
      if (jsonOrganization.hierarchie) {
        jsonOrganization.hierarchie = jsonOrganization.hierarchie.filter((item) => {
          return item.type_hierarchie === 'Service Fils';
        });
      }

      return jsonOrganization;
    })
    .filter((jsonOrganization: JsonOrganizationSchemaType) => {
      // Keep and compare its "unique" signature to skip duplicates
      if (duplicatesMarkers.find((dilaId) => dilaId === jsonOrganization.id)) {
        return false;
      } else {
        duplicatesMarkers.push(jsonOrganization.id);
      }

      // Note: we keep archived projects because they can still bring value years after :)
      return true;
    });

  // Since the JSON format is listing children instead of our database logic of pointing to the unique parent
  // We have some operations to do here
  const missingLinks: { parentId: string; childId: string }[] = [];

  const jsonLiteOrganizations = new Map<LiteOrganizationSchemaType['dilaId'], LiteOrganizationSchemaType>();
  jsonOrganizations.forEach((jsonOrganization) => {
    const liteOrganization = LiteOrganizationSchema.parse({
      dilaId: jsonOrganization.id,
      parentDilaId: null,
      level: 0,
      name: jsonOrganization.nom,
      domains: jsonOrganization.site_internet
        ? jsonOrganization.site_internet
            .map((website) => {
              const url = new URL(website.valeur);

              // The pathname must be empty otherwise there is a risk of referencing pages that are just "presentation page" on a global website
              // and to reference inititiatives to this "suborganization" according to the main domain whereas it should be linked to the organization of the main domain
              if (url.pathname !== '/') {
                return null;
              }

              return url.hostname;
            })
            .filter((websiteDomain) => {
              return !!websiteDomain;
            })
        : [],
    });

    // If the organization has no domain to be linked to, and is also not a parent organization needed when listing children
    // We can just skip it to reduce what's in the database (in fact, it seems to just reduce by 5 items... ridiculous)
    if (liteOrganization.domains.length === 0 && jsonOrganization.hierarchie?.length === 0) {
      return;
    }

    jsonLiteOrganizations.set(jsonOrganization.id, liteOrganization);

    if (jsonOrganization.hierarchie) {
      for (const hierarchie of jsonOrganization.hierarchie) {
        // Since children may not exist yet in the map to patch them, we perform all bindings after all registrations
        missingLinks.push({
          parentId: jsonOrganization.id,
          childId: hierarchie.service,
        });
      }
    }
  });

  // Bind organizations
  for (const missingLink of missingLinks) {
    const child = jsonLiteOrganizations.get(missingLink.childId);
    if (!!child) {
      // Patch the child to reference the current one as parent
      if (!!child.parentDilaId) {
        throw new Error('a child organization should have only one parent, it needs to be investigated');
      }

      child.parentDilaId = missingLink.parentId;
    } else {
      // After checking the original dataset it's true some bindings still exist whereas the child is not listed
      console.log(`the child organization "${missingLink.childId}" is not existing in the initial dataset, skipping this link`);
    }
  }

  // Browse all organizations to assign the nested level
  // It could be done by using a recursive logic each time we need it,
  // but since the list is fixed and won't be modified elsewhere than this step, it makes sense to add this metadata here
  jsonLiteOrganizations.forEach((jsonLiteOrganization) => {
    jsonLiteOrganization.level = retrieveNestedOrganizationLevel(jsonLiteOrganizations, jsonLiteOrganization);
  });

  await prisma.$transaction(
    async (tx) => {
      const storedOrganizations = await tx.organization.findMany({
        select: {
          level: true,
          dilaId: true,
          name: true,
          domains: true,
          parentOrganization: {
            select: {
              dilaId: true,
            },
          },
        },
      });

      // To make the diff we compare only meaningful properties
      const storedLiteOrganizations: typeof jsonLiteOrganizations = new Map();
      storedOrganizations.forEach((organization) => {
        storedLiteOrganizations.set(
          organization.dilaId,
          LiteOrganizationSchema.parse({
            dilaId: organization.dilaId,
            parentDilaId: organization.parentOrganization?.dilaId || null,
            level: organization.level,
            name: organization.name,
            domains: organization.domains,
          })
        );
      });

      const diffResult = getDiff(storedLiteOrganizations, jsonLiteOrganizations);

      console.log(`synchronizing organizations into the database (${formatDiffResultLog(diffResult)})`);

      // We make sure to delete deep children and going to the top
      const sortedOrganizationsToDelete = diffResult.removed.sort((a, b) => {
        return b.level - a.level;
      });

      await tx.organization.deleteMany({
        where: {
          dilaId: {
            in: sortedOrganizationsToDelete.map((deletedLiteOrganization) => deletedLiteOrganization.dilaId),
          },
        },
      });

      // We make sure to create top organization so deeper level can be linked to the upper level
      const sortedOrganizationsToAdd = diffResult.added.sort((a, b) => {
        return a.level - b.level;
      });

      for (const addedLiteOrganization of sortedOrganizationsToAdd) {
        watchGracefulExitInLoop();

        // `createMany` cannot be used to connect the organization to its parent by using the `dilaId` (which is not the foreign key)
        await tx.organization.create({
          data: {
            dilaId: addedLiteOrganization.dilaId,
            level: addedLiteOrganization.level,
            name: addedLiteOrganization.name,
            domains: addedLiteOrganization.domains,
            parentOrganization: !!addedLiteOrganization.parentDilaId
              ? {
                  connect: {
                    dilaId: addedLiteOrganization.parentDilaId,
                  },
                }
              : undefined,
          },
          select: {
            id: true, // Ref: https://github.com/prisma/prisma/issues/6252
          },
        });
      }

      for (const updatedLiteOrganization of diffResult.updated) {
        watchGracefulExitInLoop();

        await tx.organization.update({
          where: {
            dilaId: updatedLiteOrganization.dilaId,
          },
          data: {
            dilaId: updatedLiteOrganization.dilaId,
            level: updatedLiteOrganization.level,
            name: updatedLiteOrganization.name,
            domains: updatedLiteOrganization.domains,
            parentOrganization: {
              connect: !!updatedLiteOrganization.parentDilaId
                ? {
                    dilaId: updatedLiteOrganization.parentDilaId,
                  }
                : undefined,
              disconnect: !updatedLiteOrganization.parentDilaId,
            },
          },
          select: {
            id: true, // Ref: https://github.com/prisma/prisma/issues/6252
          },
        });
      }
    },
    {
      timeout: minutesToMilliseconds(process.env.NODE_ENV !== 'production' ? 20 : 5), // Since dealing with a lot of data, prevent closing whereas everything is alright
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

export async function enhanceOrganizationsIntoDatabase() {}
