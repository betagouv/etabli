import { Gitlab } from '@gitbeaker/rest';
import { Octokit } from '@octokit/rest';
import { Prisma } from '@prisma/client';
import assert from 'assert';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import fsSync from 'fs';
import fs from 'fs/promises';
import jsYaml from 'js-yaml';
import linkifyit from 'linkify-it';
import { ParseResultType, parseDomain } from 'parse-domain';
import path from 'path';
import z from 'zod';

import { downloadFile } from '@etabli/src/common';
import { LiteRepositoryOrganizationSchema, LiteRepositoryOrganizationSchemaType } from '@etabli/src/models/entities/repository-organization';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { formatDiffResultLog, getDiff } from '@etabli/src/utils/comparaison';
import { formatArrayProgress } from '@etabli/src/utils/format';
import { formatSearchQuery } from '@etabli/src/utils/prisma';

const __root_dirname = process.cwd();
const linkify = linkifyit();
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN || undefined, // If not specified it uses public shared quota based on IP
});

export const latestRemoteYamlUrl = 'https://git.sr.ht/~codegouvfr/codegouvfr-sources/blob/main/comptes-organismes-publics.yml';
export const localYamlPath = path.resolve(__root_dirname, './data/repository-organizations.yaml');

export const JsonRepositoryOrganizationsSchema = z.record(
  z.string().url(),
  z.object({
    service_of: z.array(z.string().min(1)).nullish(),
  })
);
export type JsonRepositoryOrganizationsSchemaType = z.infer<typeof JsonRepositoryOrganizationsSchema>;

export async function saveRepositoryOrganizationListFile(cache = true) {
  if (!cache || !fsSync.existsSync(localYamlPath)) {
    await downloadFile(latestRemoteYamlUrl, localYamlPath);
  }
}

export async function formatRepositoryOrganizationsIntoDatabase() {
  const content = await fs.readFile(localYamlPath, 'utf-8');
  const jsonContent: any = jsYaml.load(content);

  // [WORKAROUND] This entry does not respect the format... so temporarly removing it
  delete jsonContent['https://gitlab.villejuif.fr'];

  const repositoryOrganizations = JsonRepositoryOrganizationsSchema.parse(jsonContent);

  const jsonLiteRepositoryOrganizations = new Map<LiteRepositoryOrganizationSchemaType['url'], LiteRepositoryOrganizationSchemaType>();
  for (const [repositoryOrganizationUrl, repositoryOrganizationMetadata] of Object.entries(repositoryOrganizations)) {
    jsonLiteRepositoryOrganizations.set(
      repositoryOrganizationUrl,
      LiteRepositoryOrganizationSchema.parse({
        url: repositoryOrganizationUrl,
        entities: !!repositoryOrganizationMetadata ? repositoryOrganizationMetadata : [],
      })
    );
  }

  await prisma.$transaction(
    async (tx) => {
      const storedRepositoryOrganizations = await tx.repositoryOrganization.findMany({
        select: {
          url: true,
          entities: true,
        },
      });

      // To make the diff we compare only meaningful properties
      const storedLiteRepositoryOrganizations: typeof jsonLiteRepositoryOrganizations = new Map();
      storedRepositoryOrganizations.forEach((repositoryOrganization) => {
        storedLiteRepositoryOrganizations.set(
          repositoryOrganization.url,
          LiteRepositoryOrganizationSchema.parse({
            url: repositoryOrganization.url,
            entities: repositoryOrganization.entities,
          })
        );
      });

      const diffResult = getDiff(storedLiteRepositoryOrganizations, jsonLiteRepositoryOrganizations);

      console.log(`synchronizing repository organizations into the database (${formatDiffResultLog(diffResult)})`);

      await tx.repositoryOrganization.deleteMany({
        where: {
          url: {
            in: diffResult.removed.map((deletedLiteRepositoryOrganization) => deletedLiteRepositoryOrganization.url),
          },
        },
      });

      await tx.repositoryOrganization.createMany({
        data: diffResult.added.map((addedLiteRepositoryOrganization) => ({
          url: addedLiteRepositoryOrganization.url,
          entities: addedLiteRepositoryOrganization.entities,
          updateRelatedDomains: true,
          updateRelatedOrganizations: true,
        })),
        skipDuplicates: true,
      });

      for (const updatedLiteRepositoryOrganization of diffResult.updated) {
        watchGracefulExitInLoop();

        await tx.repositoryOrganization.update({
          where: {
            url: updatedLiteRepositoryOrganization.url,
          },
          data: {
            url: updatedLiteRepositoryOrganization.url,
            entities: updatedLiteRepositoryOrganization.entities,
            updateRelatedDomains: true,
            updateRelatedOrganizations: true,
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

export async function updateRelatedDomains() {
  const repositoryOrganizations = await prisma.repositoryOrganization.findMany({
    where: {
      updateRelatedDomains: true,
    },
    select: {
      id: true,
      url: true,
      entities: true,
    },
  });

  for (const [repositoryOrganizationIndex, repositoryOrganization] of Object.entries(repositoryOrganizations)) {
    watchGracefulExitInLoop();

    console.log(
      `try to retrieve domains for the repository organization ${repositoryOrganization.url} (${repositoryOrganization.id}) ${formatArrayProgress(
        repositoryOrganizationIndex,
        repositoryOrganizations.length
      )}`
    );

    const relatedDomains: string[] = [];
    const url = new URL(repositoryOrganization.url);

    if (url.pathname === '/') {
      // The URL seems a link to a forge instead of a forge organization, so no remote metadata to retrieve
      // We take the upper level of domain because in most case it's `git.domain.com`
      const parsedDomain = parseDomain(url.hostname);
      if (parsedDomain.type === ParseResultType.Listed) {
        parsedDomain.labels.slice(1).join('.');
      } else {
        relatedDomains.push(url.hostname);
      }
    } else {
      if (url.hostname === 'github.com') {
        const result = await octokit.rest.orgs.get({
          org: url.pathname,
        });

        assert(result.status === 200);

        if (result.data.blog) {
          // Even if "blog" is a strange naming, it's the main website of the organization
          const blogUrl = new URL(result.data.blog);

          // We do not restrict having URLs with pathname, maybe we should depending on the cases we will face
          relatedDomains.push(blogUrl.hostname);
        } else if (result.data.description) {
          // If no main link consider extracting those from the description
          const matches = linkify.match(result.data.description) || [];

          for (const match of matches) {
            const matchUrl = new URL(match.url);

            // Also consider links with paths... maybe to adjust
            relatedDomains.push(matchUrl.hostname);
          }
        }
      } else {
        // The default case is to consider it as a GitLab forge (so using this API)
        const deepCopyUrl = new URL(url.toString());
        const groupId = deepCopyUrl.pathname.substring(1); // We remove the leading slash of pathname

        url.pathname = '';
        const forgeHost = url.toString();

        const gitbreaker = new Gitlab({
          host: forgeHost,
          token: 'no_matter_since_public_info',
        });

        const groupMetadata = await gitbreaker.Groups.show(groupId);

        // GitLab groups have no property to define a website so if there is one it's also specified into the description
        const matches = linkify.match(groupMetadata.description) || [];

        for (const match of matches) {
          const matchUrl = new URL(match.url);

          // Also consider links with paths... maybe to adjust
          relatedDomains.push(matchUrl.hostname);
        }
      }
    }

    await prisma.repositoryOrganization.update({
      where: {
        id: repositoryOrganization.id,
      },
      data: {
        relatedDomains: relatedDomains,
        updateRelatedDomains: false,
      },
    });
  }
}

export async function updateRelatedOrganizations() {
  const repositoryOrganizations = await prisma.repositoryOrganization.findMany({
    where: {
      updateRelatedOrganizations: true,
    },
    select: {
      id: true,
      url: true,
      entities: true,
      relatedDomains: true,
    },
  });

  for (const [repositoryOrganizationIndex, repositoryOrganization] of Object.entries(repositoryOrganizations)) {
    watchGracefulExitInLoop();

    console.log(
      `try to bind related organizations to the repository organization ${repositoryOrganization.url} (${
        repositoryOrganization.id
      }) ${formatArrayProgress(repositoryOrganizationIndex, repositoryOrganizations.length)}`
    );

    let relatedOrganizationsIds: string[] = [];

    // First of all, see if the source metadata can be linked to an organization
    for (const entity of repositoryOrganization.entities) {
      const matchingOrganizations = await prisma.organization.findMany({
        select: {
          id: true,
        },
        orderBy: {
          _relevance: {
            fields: ['name'],
            search: formatSearchQuery(entity),
            sort: 'asc',
          },
        },
        take: 1,
      });

      if (matchingOrganizations.length === 1) {
        // TODO: threshold on the score!?
        // TODO: threshold on the score!?
        // TODO: threshold on the score!?
        relatedOrganizationsIds.push(matchingOrganizations[0].id);
      }

      throw 444; // TODO: check the score
    }

    // We consider with and without `www.` because it always depends on who has written
    const relatedDomainsToSearch: string[] = [];
    for (const relatedDomain of repositoryOrganization.relatedDomains) {
      if (relatedDomain.startsWith('www.')) {
        relatedDomainsToSearch.push(relatedDomain);
        relatedDomainsToSearch.push(relatedDomain.replace(/^www\./, ''));
      } else {
        relatedDomainsToSearch.push(`www.${relatedDomain}`);
        relatedDomainsToSearch.push(relatedDomain);
      }
    }

    // For related domains, we do something straight and stupid: binding to all organizations having this domain
    // This to not over complexify here the logic of keeping only the top organization
    // (this will be done when linking the initiative since on the other side it has also domains to compare)
    const matchingOrganizations = await prisma.organization.findMany({
      where: {
        domains: {
          hasSome: relatedDomainsToSearch,
        },
      },
      select: {
        id: true,
      },
    });

    for (const matchingOrganization of matchingOrganizations) {
      relatedOrganizationsIds.push(matchingOrganization.id);
    }

    // Unique ones
    relatedOrganizationsIds = [...new Set(relatedOrganizationsIds)];

    await prisma.repositoryOrganization.update({
      where: {
        id: repositoryOrganization.id,
      },
      data: {
        updateRelatedOrganizations: false,
        RepositoryOrganizationsOnOrganizations: {
          // Maybe the `set` logic would trigger errors in some cases as it did for initiatives (the case was more complex, we had to change the logic)
          set: relatedOrganizationsIds.map((relatedOrganizationsId) => {
            return {
              repositoryOrganizationId_organizationId: {
                organizationId: relatedOrganizationsId,
                repositoryOrganizationId: repositoryOrganization.id,
              },
            };
          }),
        },
      },
    });
  }
}

export async function enhanceRepositoryOrganizationsIntoDatabase() {
  await updateRelatedDomains();
  await updateRelatedOrganizations();
}
