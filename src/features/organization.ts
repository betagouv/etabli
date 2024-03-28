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
    hierarchie: z
      .array(
        z.object({
          type_hierarchie: z.literal('Service Fils').or(z.literal('Autre hiérarchie')),
          service: z.string().uuid(),
        })
      )
      .nullable(),
    site_internet: z
      .array(
        z.object({
          libelle: z.string(),
          valeur: z.preprocess((v) => {
            // A few links are the missing protocol so using a specific library to handle this case
            const matches = linkify.match(v as string);

            return matches ? matches[0].url : null;
          }, z.string().url()),
        })
      )
      .nullable(),
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
      console.log('-------');
      console.log(record);
      const jsonOrganization = JsonOrganizationSchema.parse({
        ...record,
        // Since they provide a few properties as stringified objects, we have to parse them (doing it with zod complicates the validation)
        hierarchie: !!record.hierarchie ? JSON.parse(record.hierarchie) : null,
        site_internet: !!record.site_internet ? JSON.parse(record.site_internet) : null,
      });

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
    jsonLiteOrganizations.set(
      jsonOrganization.id,
      LiteOrganizationSchema.parse({
        dilaId: jsonOrganization.id,
        parentDilaId: null,
        level: 0,
        name: jsonOrganization.nom,
        domains: jsonOrganization.site_internet
          ? jsonOrganization.site_internet.map((website) => {
              const url = new URL(website.valeur);

              return url.hostname;
            })
          : [],
      })
    );

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
      throw new Error('the child organization should exist in the map to be bound');
    }
  }

  // Browse all organizations to assign the nested level
  // It could be done by using a recursive logic each time we need it,
  // but since the list is fixed and won't be modified elsewhere than this step, it makes sense to add this metadata here
  jsonLiteOrganizations.forEach((jsonLiteOrganization) => {
    jsonLiteOrganization.level = retrieveNestedOrganizationLevel(jsonLiteOrganizations, jsonLiteOrganization);
  });

  console.log(jsonLiteOrganizations.size);
  throw 4444;

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

      await tx.organization.deleteMany({
        where: {
          dilaId: {
            in: diffResult.removed.map((deletedLiteOrganization) => deletedLiteOrganization.dilaId),
          },
        },
      });

      // TODO: order for delete/create/update

      await tx.organization.createMany({
        data: diffResult.added.map((addedLiteOrganization) => {
          return {
            dilaId: addedLiteOrganization.dilaId,
            parentDilaId: addedLiteOrganization.parentDilaId,
            level: addedLiteOrganization.level,
            name: addedLiteOrganization.name,
            domains: addedLiteOrganization.domains,
          };
        }),
        skipDuplicates: true,
      });

      for (const updatedLiteOrganization of diffResult.updated) {
        watchGracefulExitInLoop();

        const updatedOrganization = await tx.organization.update({
          where: {
            dilaId: updatedLiteOrganization.dilaId,
          },
          data: {
            dilaId: updatedLiteOrganization.dilaId,
            parentDilaId: updatedLiteOrganization.parentDilaId,
            level: updatedLiteOrganization.level,
            name: updatedLiteOrganization.name,
            domains: updatedLiteOrganization.domains,
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
