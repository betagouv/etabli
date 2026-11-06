import { input } from '@inquirer/prompts';
import * as Sentry from '@sentry/nextjs';
import assert from 'assert';
import { eachOfLimit } from 'async';
import chalk from 'chalk';
import { differenceInDays } from 'date-fns/differenceInDays';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import { secondsToMilliseconds } from 'date-fns/secondsToMilliseconds';
import { subDays } from 'date-fns/subDays';
import { EventEmitter } from 'eventemitter3';
import { $ } from 'execa';
import fastFolderSize from 'fast-folder-size';
import fsSync from 'fs';
import fs from 'fs/promises';
import { glob } from 'glob';
import graphlib, { Graph } from 'graphlib';
import handlebars from 'handlebars';
import OpenAI from 'openai';
import path from 'path';
import prettyBytes from 'pretty-bytes';
import { SimpleGit, SimpleGitProgressEvent, simpleGit } from 'simple-git';
import { Digraph, toDot } from 'ts-graphviz';
import { toFile } from 'ts-graphviz/adapter';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

import manifestsEndingPatterns from '@etabli/src/bibliothecary/manifests-patterns.json';
import { ChunkEventEmitter, llmManagerInstance } from '@etabli/src/features/llm';
import { buildOrganizationMatcher } from '@etabli/src/features/organization';
import { getComparableWebsiteName, normalizeHostname, normalizeRepositoryUrl } from '@etabli/src/features/organization-matching';
import { hasProbableGenericDomain, isLikelyStudentRepository } from '@etabli/src/features/repository';
import { FunctionalUseCase, Prisma, RawDomain, RawRepository } from '@etabli/src/generated/prisma/client';
import {
  InitiativeTemplateSchema,
  RepositoryTemplateSchema,
  RepositoryTemplateSchemaType,
  ResultSchemaType,
  WebsiteTemplateSchema,
  WebsiteTemplateSchemaType,
  resultSchemaDefinition,
} from '@etabli/src/gpt/template';
import { getServerTranslation } from '@etabli/src/i18n';
import { llmResponseFormatError, noInitiativeContentToComputeError, tokensReachTheLimitError } from '@etabli/src/models/entities/errors';
import { LiteInitiativeMapSchema, LiteInitiativeMapSchemaType } from '@etabli/src/models/entities/initiative';
import { prisma } from '@etabli/src/prisma';
import { analyzeWithSemgrep } from '@etabli/src/semgrep/index';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { bitsFor } from '@etabli/src/utils/bits';
import { formatDiffResultLog, getDiff } from '@etabli/src/utils/comparaison';
import { capitalizeFirstLetter, formatArrayProgress } from '@etabli/src/utils/format';
import { getClosestSinkNode } from '@etabli/src/utils/graph';
import { getMergedInitiativeMapsIdentifiers, getMovedInitiativeMaps } from '@etabli/src/utils/initiative-map';
import { languagesExtensions } from '@etabli/src/utils/languages';
import { chomiumMaxConcurrency, llmManagerMaximumApiRequestsPerSecond, maximumInitiativesPerRun } from '@etabli/src/utils/request';
import { sleep } from '@etabli/src/utils/sleep';

const __root_dirname = process.cwd();

const fastFolderSizeAsync = promisify(fastFolderSize);

// Switch it when testing locally to prevent multiplying network request whereas the remote content has probably no change since then
// ... but be warned that for now if there is an error with Git, the cache will be misleading since it matches only the existence of folders (we could improve that by using try/catch/finally around git steps)
const useLocalFileCache = false;

const filesToKeepGitEndingPatterns: (string | RegExp)[] = [
  // This is used to reduce size of the repository once downloaded
  // Notes:
  // - only keep programming files and manifests since that what we only use for now (in addition to README files)
  // - with the current patterns we cannot rely on using leading `/` for the root, we should convert them to regexp otherwise
  /readme$/i,
  /readme\.txt$/i,
  /readme\.md$/i,
  ...manifestsEndingPatterns,
  ...languagesExtensions,
];

const noImgAndSvgFilterPath = path.resolve(__root_dirname, './src/pandoc/no-img-and-svg.lua');
const extractMetaDescriptionFilterPath = path.resolve(__root_dirname, './src/pandoc/extract-meta-description.lua');
const removeInlineFileContentFilterPath = path.resolve(__root_dirname, './src/pandoc/remove-inline-file-content.lua');

export type NodeLabel =
  | {
      type: 'domain';
      entity: Pick<RawDomain, 'id' | 'name'>;
    }
  | {
      type: 'repository';
      entity: Pick<RawRepository, 'id' | 'repositoryUrl'>;
    };

const MAXIMUM_WEBSITES_LINKING_A_REPOSITORY = 3;

// Some sources list these platforms as the website of a public organization, but they are not public services and their
// reputation would put them above all the others. Only exact names, since a commune hosted on a subdomain stays valid
export const excludedPlatformDomains = [
  'www.facebook.com',
  'fr-fr.facebook.com',
  'wordpress.com',
  'www.afternic.com',
  'www.wmaker.net',
  'www.lescommunes.com',
  'www.espace-citoyens.net',
];

export async function inferInitiativesFromDatabase() {
  // TODO: should it be locked globally? But it should be a be long to compute... at risk since a lot of records to fetch/process/update

  console.log(`starting the process of inferring initiative maps`);

  const rawDomainCriterias: Prisma.RawDomainWhereInput = {
    name: { notIn: excludedPlatformDomains },
    indexableFromRobotsTxt: true, // Websites marked to not be indexed should not end into Etabli, moreover it helps not indexing tools like Grafana...
    websiteContentIndexable: true, // Same as above
    websiteHasContent: true, // When if the page returns no visible text content, we skip it
    websiteHasStyle: true, // A website not having style in 2023+ is likely a test or exposing raw API data
    redirectDomainTarget: null, // A redirecting website won't be processed since we cannot guarantee the new location, we expect the target domain to be added to our source dataset
  };

  const rawDomains = await prisma.rawDomain.findMany({
    where: rawDomainCriterias,
    select: {
      id: true,
      name: true,
      probableRepositoryUrl: true,
      similarDomains: {
        where: rawDomainCriterias,
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc', // To keep similar order in logs across runs, and guarantee similar processing for graph logic below
    },
  });

  const rawRepositoryCriterias: Prisma.RawRepositoryWhereInput = {
    OR: [
      // It's rare a fork is dedicated new products (even more since GitHub allows "templates" now for project stacks)
      // Note: we tried `not: true` but it was not including those with `null`... which is weird
      { isFork: false },
      { isFork: null },
    ],
  };

  const eligibleAndStudentRawRepositories = await prisma.rawRepository.findMany({
    where: rawRepositoryCriterias,
    select: {
      id: true,
      name: true,
      repositoryUrl: true,
      homepage: true,
      starsCount: true,
      forksCount: true,
      creationDate: true,
      lastModification: true,
      probableWebsiteUrl: true,
      probableWebsiteDomain: true,
      similarRepositories: {
        where: rawRepositoryCriterias, // It avoids redoing the filtering locally to make sure they are eligible (because a similar one may be marked as such without satisfying criterias to be listed)
        select: {
          id: true,
          repositoryUrl: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc', // To keep similar order in logs across runs, and guarantee similar processing for graph logic below
    },
  });

  // They are kept as raw data but they must not become initiatives (the similar ones are ignored the same way below)
  const studentRawRepositoriesIds = new Set(
    eligibleAndStudentRawRepositories.filter(isLikelyStudentRepository).map((rawRepository) => rawRepository.id)
  );
  const rawRepositories = eligibleAndStudentRawRepositories.filter((rawRepository) => !studentRawRepositoriesIds.has(rawRepository.id));

  console.log(
    `inferring according to ${rawDomains.length} raw domains and ${rawRepositories.length} raw repositories (${studentRawRepositoriesIds.size} repositories skipped as likely student projects)`
  );

  // Below we use a graph logic to be more explicit in what happens
  // It may also helps fixing "parent - child" pairs from the database (we tried to have only 2 levels, but after multiple updates it's possible we have 2+ levels due to nested `mainSimilarXxx`)
  // [IMPORTANT] Edge `from` is the child whereas `to` is the parent (it was required to use Dijkstra's algorithm)
  const graph = new Graph();

  // Create all nodes with details to not mess with duplicated logic then
  for (const rawDomain of rawDomains) {
    graph.setNode(rawDomain.id, {
      type: 'domain',
      entity: rawDomain,
    } as NodeLabel);

    // If will create the node with only "id" if not existing, and over next iterations it will put details onto it
    // Note: we avoid having loops between 2 nodes of the same type (complicating the logic to calculate the path then)
    for (const similarDomain of rawDomain.similarDomains) {
      if (!graph.edge(rawDomain.id, similarDomain.id)) {
        graph.setEdge(similarDomain.id, rawDomain.id, 1 / 1);
      }
    }
  }

  for (const rawRepository of rawRepositories) {
    graph.setNode(rawRepository.id, {
      type: 'repository',
      entity: rawRepository,
    } as NodeLabel);

    // If will create the node with only "id" if not existing, and over next iterations it will put details onto it
    // Note: we avoid having loops between 2 nodes of the same type (complicating the logic to calculate the path then)
    for (const similarRepository of rawRepository.similarRepositories) {
      if (studentRawRepositoriesIds.has(similarRepository.id)) {
        continue;
      }

      if (!graph.edge(rawRepository.id, similarRepository.id)) {
        graph.setEdge(similarRepository.id, rawRepository.id, 1 / 1);
      }
    }
  }

  // Create all edges between pair of nodes with a scoring on edges
  const rawDomainsByHostname = new Map<string, typeof rawDomains>();
  const rawDomainsByComparableName = new Map<string, typeof rawDomains>();
  for (const rawDomain of rawDomains) {
    const hostname = normalizeHostname(rawDomain.name);
    rawDomainsByHostname.set(hostname, [...(rawDomainsByHostname.get(hostname) ?? []), rawDomain]);

    const comparableName = getComparableWebsiteName(rawDomain.name);
    if (comparableName) {
      rawDomainsByComparableName.set(comparableName, [...(rawDomainsByComparableName.get(comparableName) ?? []), rawDomain]);
    }
  }

  const eligibleRawRepositories = rawRepositories.filter((rawRepository) => {
    // Do not match the repository with a probable domain if this domain is a service commonly used by "anyone" and not scoped to the project iself
    return !hasProbableGenericDomain(rawRepository);
  });

  const rawRepositoriesByUrl = new Map(
    eligibleRawRepositories.map((rawRepository) => [normalizeRepositoryUrl(rawRepository.repositoryUrl), rawRepository])
  );

  const scores = new Map<string, { rawRepositoryId: string; rawDomainId: string; score: number }>();
  const addScore = (rawRepositoryId: string, rawDomainId: string, score: number) => {
    const key = `${rawRepositoryId}:${rawDomainId}`;

    scores.set(key, { rawRepositoryId: rawRepositoryId, rawDomainId: rawDomainId, score: (scores.get(key)?.score ?? 0) + score });
  };

  // A repository linked by many websites is not specific to one of them (e.g. a licence, a shared template)
  const rawDomainsIdsByLinkedRepository = new Map<string, string[]>();
  for (const rawDomain of rawDomains) {
    const linkedRawRepository = rawDomain.probableRepositoryUrl
      ? rawRepositoriesByUrl.get(normalizeRepositoryUrl(rawDomain.probableRepositoryUrl))
      : undefined;

    if (linkedRawRepository) {
      rawDomainsIdsByLinkedRepository.set(linkedRawRepository.id, [
        ...(rawDomainsIdsByLinkedRepository.get(linkedRawRepository.id) ?? []),
        rawDomain.id,
      ]);
    }
  }

  for (const [rawRepositoryId, rawDomainsIds] of rawDomainsIdsByLinkedRepository) {
    if (rawDomainsIds.length <= MAXIMUM_WEBSITES_LINKING_A_REPOSITORY) {
      for (const rawDomainId of rawDomainsIds) {
        addScore(rawRepositoryId, rawDomainId, 2);
      }
    }
  }

  for (const rawRepository of eligibleRawRepositories) {
    if (rawRepository.probableWebsiteDomain) {
      for (const rawDomain of rawDomainsByHostname.get(normalizeHostname(rawRepository.probableWebsiteDomain)) ?? []) {
        addScore(rawRepository.id, rawDomain.id, 2);
      }
    }
  }

  // Without any explicit link between them, a same name within a same organization is enough
  const organizationMatcher = await buildOrganizationMatcher();
  if (organizationMatcher) {
    let sameNameLinksCount = 0;

    for (const rawRepository of eligibleRawRepositories) {
      const candidates = rawDomainsByComparableName.get(rawRepository.name.toLowerCase());
      if (!candidates) {
        continue;
      }

      const repositoryOrganizationsIds = organizationMatcher.matchRepository(rawRepository.repositoryUrl);
      const relatedRawDomains = candidates.filter((rawDomain) => {
        return organizationMatcher.areCloseOrganizations(repositoryOrganizationsIds, organizationMatcher.matchWebsite(`https://${rawDomain.name}`));
      });

      if (relatedRawDomains.length > 0 && relatedRawDomains.length <= MAXIMUM_WEBSITES_LINKING_A_REPOSITORY) {
        for (const rawDomain of relatedRawDomains) {
          addScore(rawRepository.id, rawDomain.id, 1);
          sameNameLinksCount++;
        }
      }
    }

    console.log(`${sameNameLinksCount} links have been deduced between websites and repositories named the same way within an organization`);
  }

  for (const { rawRepositoryId, rawDomainId, score } of scores.values()) {
    graph.setEdge(rawRepositoryId, rawDomainId, 1 / score);
  }

  console.log(`building initiative map groups by using a graph of nodes`);

  const nodes = graph.nodes();

  console.log(`${nodes.length} nodes need a calculation`);

  // To debug it may be useful to have the graph preview
  if (!!false) {
    const displayNodeWithNoEdge = true;
    const workaroundToFixHtmlDisplayWhenTooManyNodes = false;

    // Create a Graphviz instance
    const G = new Digraph(undefined, {
      fontname: 'Verdana',
      margin: '3.0,3.0', // Not working (nor `pad` nor `area`)
    });

    const A = G.createSubgraph('A', {});

    const sinkNodes = graph.sinks();

    // Add nodes and edges to the Graphviz instance
    graph.nodes().forEach((nodeId) => {
      // If it's a sink with no edge there is no reason to display it on the graph (it would only overload it)
      // `graph.sinks()` should be what we do after, but here it's an approximation because it would not be exact in case of loop with edges...
      if (!displayNodeWithNoEdge && sinkNodes.includes(nodeId) && graph.nodeEdges(nodeId)?.length === 0) {
        return;
      }

      const node = graph.node(nodeId) as NodeLabel;

      // At start we used HTML-like with basic elements like `<B>` and `<BR>` but there is no way to put a link not being the whole box
      // So using tables to hack it while respecting a strict format so it's no failing
      let boxColor: string;
      let label: string;
      if (node.type === 'domain') {
        boxColor = '#dcdcfc';
        label = workaroundToFixHtmlDisplayWhenTooManyNodes
          ? `${node.entity.name}\n${node.entity.id}`
          : `<<TABLE BORDER="0" CELLPADDING="0" CELLSPACING="0"><TR><TD HREF="https://${node.entity.name}" TARGET="_blank"><B>${node.entity.name}</B></TD></TR><TR><TD><FONT POINT-SIZE="12">${node.entity.id}</FONT></TD></TR></TABLE>>`;
      } else {
        boxColor = '#ffc5c5';
        label = workaroundToFixHtmlDisplayWhenTooManyNodes
          ? `${node.entity.repositoryUrl.replace('https://', '')}\n${node.entity.id}`
          : `<<TABLE BORDER="0" CELLPADDING="0" CELLSPACING="0"><TR><TD HREF="${
              node.entity.repositoryUrl
            }" TARGET="_blank"><B>${node.entity.repositoryUrl.replace('https://', '')}</B></TD></TR><TR><TD><FONT POINT-SIZE="12">${
              node.entity.id
            }</FONT></TD></TR></TABLE>>`;
      }

      A.createNode(nodeId, {
        shape: 'box',
        style: 'filled,rounded',
        margin: '0.4,0.3',
        fontcolor: '#161616',
        label: label,
        fillcolor: boxColor,
        color: boxColor,
      });
    });

    graph.edges().forEach((edge) => {
      const edgeValue = graph.edge(edge.v, edge.w) as number;

      A.createEdge([edge.v, edge.w], {
        label: `<${edgeValue}>`,
        labeldistance: 2.0, // Not working but that's fine
        color: '#161616',
        arrowsize: 1.0,
        penwidth: 3,
      });
    });

    const dot = toDot(G);

    // - We wanted at start to rely on the `.dot` file through the `vscode` extension `Graphviz Interactive Preview` which has search feature and enables interactions but it was crashing due to too many nodes
    // - Using the SVG preview inside `vscode` is good enough to navigate... but we cannot select/search text
    // - The solution to manage both is to use Chrome as a browser (except the zoom in/out can only be managed by modifying the style of the `scale()` value on the `#graph0` element)
    await toFile(dot, path.resolve(__root_dirname, './data/graph.svg'), { format: 'svg' });
    // await fs.writeFile(path.resolve(__root_dirname, './data/graph.dot'), dot);

    console.log(`the graph has been saved`);
  }

  // Each initiative map is defined by a ending node (corresponding to the top parent)
  const initiativeMapsWithLabels: Map<
    string,
    {
      mainItem: NodeLabel;
      items: NodeLabel[];
    }
  > = new Map();

  // Each node must be associated with the closest sink (closest top parent)
  for (const [nodeIdIndex, nodeId] of Object.entries(nodes)) {
    watchGracefulExitInLoop();

    console.log(`looking for the closest parent node for the entity ${nodeId} ${formatArrayProgress(nodeIdIndex, nodes.length)}`);

    const closestSinkNodeId = getClosestSinkNode(graph, nodeId);

    const node = graph.node(nodeId) as NodeLabel;
    assert(node);

    let initiativeMapWithLabels = initiativeMapsWithLabels.get(closestSinkNodeId);

    if (!initiativeMapWithLabels) {
      const closestNode = graph.node(closestSinkNodeId) as NodeLabel;
      assert(closestNode);

      initiativeMapWithLabels = {
        mainItem: closestNode,
        items: [closestNode],
      };
      initiativeMapsWithLabels.set(closestNode.entity.id, initiativeMapWithLabels);
    }

    if (nodeId !== closestSinkNodeId) {
      initiativeMapWithLabels.items.push(node);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      const storedInitiativeMaps = await tx.initiativeMap.findMany({
        select: {
          id: true,
          mainItemIdentifier: true,
          RawDomainsOnInitiativeMaps: {
            select: {
              rawDomainId: true,
            },
          },
          RawRepositoriesOnInitiativeMaps: {
            select: {
              rawRepositoryId: true,
            },
          },
        },
      });

      // To make the diff we compare only meaningful properties
      const storedLiteInitiativeMaps = new Map<LiteInitiativeMapSchemaType['mainItemIdentifier'], LiteInitiativeMapSchemaType>();
      storedInitiativeMaps.forEach((initiativeMap) =>
        storedLiteInitiativeMaps.set(
          initiativeMap.mainItemIdentifier,
          LiteInitiativeMapSchema.parse({
            mainItemIdentifier: initiativeMap.mainItemIdentifier,
            rawDomainsIds: initiativeMap.RawDomainsOnInitiativeMaps.map((rawDomainOnIMap) => rawDomainOnIMap.rawDomainId),
            rawRepositoriesIds: initiativeMap.RawRepositoriesOnInitiativeMaps.map((rawRepositoryOnIMap) => rawRepositoryOnIMap.rawRepositoryId),
          })
        )
      );

      const computedLiteInitiativeMaps: typeof storedLiteInitiativeMaps = new Map();
      initiativeMapsWithLabels.forEach((initiativeMapWithLabels) => {
        const rawDomainsIds: string[] = [];
        const rawRepositoriesIds: string[] = [];

        for (const item of initiativeMapWithLabels.items) {
          if (item.type === 'domain') {
            rawDomainsIds.push(item.entity.id);
          } else {
            rawRepositoriesIds.push(item.entity.id);
          }
        }

        computedLiteInitiativeMaps.set(
          initiativeMapWithLabels.mainItem.entity.id,
          LiteInitiativeMapSchema.parse({
            mainItemIdentifier: initiativeMapWithLabels.mainItem.entity.id,
            rawDomainsIds: rawDomainsIds,
            rawRepositoriesIds: rawRepositoriesIds,
          })
        );
      });

      console.log(`${computedLiteInitiativeMaps.size} initiative maps remain after grouping the nodes`);

      const diffResult = getDiff(storedLiteInitiativeMaps, computedLiteInitiativeMaps);

      console.log(`synchronizing initiative maps into the database (${formatDiffResultLog(diffResult)})`);

      // Initiatives of maps merged into another one are duplicates (the map removal would only leave them without origin)
      const mergedInitiativeMapsIdentifiers = getMergedInitiativeMapsIdentifiers(diffResult.removed, [
        ...diffResult.updated,
        ...diffResult.unchanged,
      ]);
      const movedInitiativeMaps = getMovedInitiativeMaps(
        diffResult.removed.filter((initiativeMap) => !mergedInitiativeMapsIdentifiers.includes(initiativeMap.mainItemIdentifier)),
        diffResult.added
      );
      const duplicatedInitiatives = await tx.initiative.deleteMany({
        where: {
          origin: {
            mainItemIdentifier: {
              in: [...mergedInitiativeMapsIdentifiers, ...movedInitiativeMaps.duplicated],
            },
          },
        },
      });

      // To be retrieved before removing their map since it would remove the link
      const initiativesToMove = await tx.initiative.findMany({
        where: {
          origin: {
            mainItemIdentifier: {
              in: movedInitiativeMaps.moved.map((movedInitiativeMap) => movedInitiativeMap.fromMainItemIdentifier),
            },
          },
        },
        select: {
          id: true,
          origin: {
            select: {
              mainItemIdentifier: true,
            },
          },
        },
      });

      console.log(`${duplicatedInitiatives.count} initiatives have been removed since their initiative map has been merged into another one`);

      await tx.initiativeMap.deleteMany({
        where: {
          mainItemIdentifier: {
            in: diffResult.removed.map((deletedLiteInitiativeMap) => deletedLiteInitiativeMap.mainItemIdentifier),
          },
        },
      });

      for (const updatedLiteInitiativeMap of diffResult.updated) {
        watchGracefulExitInLoop();

        // Since we cannot make a unique tuple with `deletedAt` we have a hack a bit and take the last one first
        const initiativeMapToUpdate = await tx.initiativeMap.findFirstOrThrow({
          where: {
            mainItemIdentifier: updatedLiteInitiativeMap.mainItemIdentifier,
          },
          select: {
            id: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        });

        // [WORKAROUND] Before we were using `set` to create/update/delete m:n relations on initiative map but it was always throwing
        // "The change you are trying to make would violate the required relation 'InitiativeMapToRawRepositoriesOnInitiativeMaps' between the `RawRepositoriesOnInitiativeMaps` and `InitiativeMap` models."
        //
        // Since we never figured out a way to use the `set`, we just remove m:n relations temporarly to bind them after (it's fine since in a transaction)
        await tx.rawDomainsOnInitiativeMaps.deleteMany({
          where: {
            OR: [
              {
                rawDomainId: {
                  in: updatedLiteInitiativeMap.rawDomainsIds,
                },
              },
              {
                initiativeMapId: initiativeMapToUpdate.id,
              },
            ],
          },
        });
        await tx.rawRepositoriesOnInitiativeMaps.deleteMany({
          where: {
            OR: [
              {
                rawRepositoryId: {
                  in: updatedLiteInitiativeMap.rawRepositoriesIds,
                },
              },
              {
                initiativeMapId: initiativeMapToUpdate.id,
              },
            ],
          },
        });

        // Since we were not able to update the `main` property with `.set` property, we do it in a second time
        await tx.initiativeMap.update({
          where: {
            id: initiativeMapToUpdate.id,
          },
          data: {
            RawDomainsOnInitiativeMaps: {
              create: updatedLiteInitiativeMap.rawDomainsIds.map((rawDomainId) => {
                return {
                  rawDomainId: rawDomainId,
                  main: rawDomainId === updatedLiteInitiativeMap.mainItemIdentifier,
                };
              }),
            },
            RawRepositoriesOnInitiativeMaps: {
              create: updatedLiteInitiativeMap.rawRepositoriesIds.map((rawRepositoryId) => {
                return {
                  rawRepositoryId: rawRepositoryId,
                  main: rawRepositoryId === updatedLiteInitiativeMap.mainItemIdentifier,
                };
              }),
            },
          },
          select: {
            id: true, // Ref: https://github.com/prisma/prisma/issues/6252
          },
        });
      }

      const addedInitiativeMapIdByMainItemIdentifier = new Map<string, string>();
      for (const addedLiteRawDomain of diffResult.added) {
        watchGracefulExitInLoop();

        // `createMany` cannot be used due to nested many creations (ref: https://github.com/prisma/prisma/issues/5455)
        const addedInitiativeMap = await tx.initiativeMap.create({
          data: {
            mainItemIdentifier: addedLiteRawDomain.mainItemIdentifier,
            update: true,
            lastUpdateAttemptWithReachabilityError: null,
            lastUpdateAttemptReachabilityError: null,
            RawDomainsOnInitiativeMaps: {
              createMany: {
                skipDuplicates: true,
                data: addedLiteRawDomain.rawDomainsIds.map((rawDomainId) => {
                  return {
                    rawDomainId: rawDomainId,
                    main: addedLiteRawDomain.mainItemIdentifier === rawDomainId,
                  };
                }),
              },
            },
            RawRepositoriesOnInitiativeMaps: {
              createMany: {
                skipDuplicates: true,
                data: addedLiteRawDomain.rawRepositoriesIds.map((rawRepositoryId) => {
                  return {
                    rawRepositoryId: rawRepositoryId,
                    main: addedLiteRawDomain.mainItemIdentifier === rawRepositoryId,
                  };
                }),
              },
            },
          },
          select: {
            id: true, // Ref: https://github.com/prisma/prisma/issues/6252
          },
        });

        addedInitiativeMapIdByMainItemIdentifier.set(addedLiteRawDomain.mainItemIdentifier, addedInitiativeMap.id);
      }

      // The upsert when feeding initiatives will update them instead of creating a second one
      const movedToByFrom = new Map(movedInitiativeMaps.moved.map((moved) => [moved.fromMainItemIdentifier, moved.toMainItemIdentifier]));
      for (const initiativeToMove of initiativesToMove) {
        watchGracefulExitInLoop();

        const toMainItemIdentifier = initiativeToMove.origin ? movedToByFrom.get(initiativeToMove.origin.mainItemIdentifier) : undefined;
        const originId = toMainItemIdentifier ? addedInitiativeMapIdByMainItemIdentifier.get(toMainItemIdentifier) : undefined;

        if (originId) {
          await tx.initiative.update({
            where: {
              id: initiativeToMove.id,
            },
            data: {
              originId: originId,
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });
        }
      }

      console.log(`${initiativesToMove.length} initiatives have followed their initiative map since its main item has changed`);

      if (diffResult.added.length > 0 || diffResult.removed.length > 0 || diffResult.updated.length > 0) {
        // There is a modification so on the next job we should tell the LLM system about new updates
        await tx.settings.update({
          where: {
            onlyTrueAsId: true,
          },
          data: {
            updateIngestedInitiatives: true,
          },
        });
      }
    },
    {
      timeout: minutesToMilliseconds(process.env.NODE_ENV !== 'production' ? 20 : 5), // Since dealing with a lot of data, prevent closing whereas everything is alright
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );

  console.log(`inferring has been done with success`);
}

export async function feedInitiativesFromDatabase() {
  // Note: Prisma does not implement yet locking table though it should help not messing with requesting the LLM system while replacing sensitive components of it
  // This race condition should remain rare and having error thrown should be fine since replayed on the next iteration
  const settings = await prisma.settings.findUniqueOrThrow({
    where: {
      onlyTrueAsId: true,
    },
  });

  await llmManagerInstance.assertToolsDocumentsAreReady(settings);

  // Helper needed when formatting
  handlebars.registerHelper('incrementIndex', function (index: number) {
    return index + 1;
  });

  const initiativeMaps = await prisma.initiativeMap.findMany({
    where: {
      update: true,
      AND: {
        OR: [
          {
            lastUpdateAttemptWithReachabilityError: {
              equals: null,
            },
          },
          {
            lastUpdateAttemptReachabilityError: {
              not: {
                in: [
                  // If one of these error codes has been reported to the database it means the situation will not change by retrying, saving resources
                  noInitiativeContentToComputeError.code, // Could be be due to the initiative having only 1 repository but this one requires authentication
                  llmResponseFormatError.code, // Having a LLM response not parsable, since we set no creativity to the LLM it won't change over time
                ],
              },
            },
            lastUpdateAttemptWithReachabilityError: {
              // Skip rows with high probability of failure since they had recently a network reachability issue
              // Note: since from scratch this batch can take several days and could be retried multiple times, we wait for 48 hours minimum
              lt: subDays(new Date(), 2),
            },
          },
        ],
      },
    },
    select: {
      id: true,
      RawDomainsOnInitiativeMaps: {
        orderBy: {
          main: 'desc', // We want to have `main: true` first of the list due to some filtering below
        },
        select: {
          main: true,
          // We no longer get the domain object from here since the content of each one cumulated was breaking either the Prisma client (ref: https://github.com/prisma/prisma/issues/13864#issuecomment-1966122882)
          // or the JavaScript heap memory maximum. So in opposite to what we have done for `matchDomains()` into `domain.ts`, chunking this `findMany(...)` is not much appropriate since we tried we even 2000 as chunk and it was failing and it would require freeing the memory as each iteration, so keeping the logic more simple here
          rawDomainId: true,
        },
      },
      RawRepositoriesOnInitiativeMaps: {
        orderBy: {
          main: 'desc', // We want to have `main: true` first of the list due to some filtering below
        },
        select: {
          main: true,
          rawRepository: {
            select: {
              id: true,
              name: true,
              repositoryUrl: true,
              description: true,
            },
          },
        },
      },
    },
  });

  // Tools of websites come from the inventory of domains, so what it has not reached yet waits for a next run
  const domainsWithoutInventory = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d."id"
    FROM "RawDomain" d
    LEFT JOIN "DomainInventory" i ON i."domain" = d."name"
    WHERE i."lastCheckAt" IS NULL
  `;
  const domainsWithoutInventoryIds = new Set(domainsWithoutInventory.map((rawDomain) => rawDomain.id));
  const initiativeMapsToProcess = initiativeMaps
    .filter((initiativeMap) => !initiativeMap.RawDomainsOnInitiativeMaps.some(({ rawDomainId }) => domainsWithoutInventoryIds.has(rawDomainId)))
    .slice(0, maximumInitiativesPerRun);

  console.log(`${initiativeMapsToProcess.length}/${initiativeMaps.length} initiative maps are ready to be processed`);

  try {
    // Prepare the message template used to ask GPT about the initiative
    const initiativeGptTemplateContent = await fs.readFile(path.resolve(__root_dirname, './src/gpt/templates/initiative.md'), 'utf-8');
    const websiteGptTemplateContent = await fs.readFile(path.resolve(__root_dirname, './src/gpt/templates/website.md'), 'utf-8');
    const repositoryGptTemplateContent = await fs.readFile(path.resolve(__root_dirname, './src/gpt/templates/repository.md'), 'utf-8');

    handlebars.registerPartial('websitePartial', websiteGptTemplateContent);
    handlebars.registerPartial('repositoryPartial', repositoryGptTemplateContent);

    const initiativeGptTemplate = handlebars.compile(initiativeGptTemplateContent);

    const { t } = getServerTranslation('common', {
      lng: 'fr',
    });

    // Since the underlying analysis per initiative map can take some time due to being in a Chromium environment
    // we parallelize hoping to save some time. But still, we take in considerations the LLM API rate limit
    const iterationLlmManagerApiCalls = 2; // One for the embeddings of the tools, and the other for the computation of the initiative sheet
    const iterationMinimumDurationInSeconds = 2; // It's maybe not fully exact
    const iterationLlmManagerApiCallsPerSecond = iterationMinimumDurationInSeconds / iterationLlmManagerApiCalls;
    const safeCoefficient = 0.8; // Since the LLM manager API will be used by people using the assistant, we do not reach the limit
    const maximumLlmManagerApiCallsConcurrency = Math.floor(
      (safeCoefficient * llmManagerMaximumApiRequestsPerSecond) / iterationLlmManagerApiCallsPerSecond
    );

    // Make sure to also consider the Chromium limits on this system
    const maxConcurrency = Math.min(maximumLlmManagerApiCallsConcurrency, chomiumMaxConcurrency);
    assert(maxConcurrency >= 1);

    console.log(`initiative maps will be computed with a maximum concurrency of ${maxConcurrency}`);

    await eachOfLimit(initiativeMapsToProcess, maxConcurrency, async function (initiativeMap, initiativeMapIndex) {
      watchGracefulExitInLoop();

      console.log(`feed initiative ${initiativeMap.id} ${formatArrayProgress(initiativeMapIndex, initiativeMapsToProcess.length)}`);

      // To debug easily we write each result on disk (also, since using lot of CLIs we have no other choice :D)
      const projectDirectory = path.resolve(__root_dirname, './data/initiatives/', initiativeMap.id);

      try {
        // As explained into the `findMany.select.RawDomainsOnInitiativeMaps` comment, due to saturation reason we get raw domains from here to have the memory freed up at the end of the iteration
        const initiativeMapRawDomains = await prisma.rawDomain.findMany({
          where: {
            id: {
              in: initiativeMap.RawDomainsOnInitiativeMaps.map((rawDomainOnIMap) => rawDomainOnIMap.rawDomainId),
            },
          },
          select: {
            id: true,
            name: true,
            websiteRawContent: true,
            websiteInferredName: true,
          },
        });
        assert(initiativeMapRawDomains.length === initiativeMap.RawDomainsOnInitiativeMaps.length);

        const websitesTemplates: WebsiteTemplateSchemaType[] = [];
        const repositoriesTemplates: RepositoryTemplateSchemaType[] = [];

        // Define the name of the initiative
        // Note: website inferred name in priority since it should better reflect the reality (not the technical name), we should end on the `main` since sorting them in the `.findMany()`
        let probableInitiativeName: string;
        if (initiativeMap.RawDomainsOnInitiativeMaps.length > 0 && initiativeMap.RawDomainsOnInitiativeMaps[0].main) {
          const mainRawDomain = initiativeMapRawDomains.find((rd) => rd.id === initiativeMap.RawDomainsOnInitiativeMaps[0].rawDomainId);
          assert(mainRawDomain);

          probableInitiativeName = mainRawDomain.websiteInferredName || mainRawDomain.name;
        } else if (initiativeMap.RawRepositoriesOnInitiativeMaps.length > 0 && initiativeMap.RawRepositoriesOnInitiativeMaps[0].main) {
          probableInitiativeName = initiativeMap.RawRepositoriesOnInitiativeMaps[0].rawRepository.name;
        } else {
          throw new Error('initiative name cannot be inferred');
        }

        let mixedInitiativeTools: string[] = [];
        for (const [rawDomainOnIMapIndex, rawDomainOnIMap] of Object.entries(initiativeMap.RawDomainsOnInitiativeMaps)) {
          watchGracefulExitInLoop();

          const rawDomain = initiativeMapRawDomains.find((rd) => rd.id === rawDomainOnIMap.rawDomainId);
          assert(rawDomain);

          console.log(
            `[${initiativeMap.id}] domain ${rawDomain.name} ${rawDomainOnIMap.main ? '(main)' : ''} (${rawDomain.id}) ${formatArrayProgress(
              rawDomainOnIMapIndex,
              initiativeMap.RawDomainsOnInitiativeMaps.length
            )}`
          );

          // Transform website HTML content into markdown to save tokens on GPT since HTML tags would increase the cost
          let websiteMarkdownContent: string | null = null;
          if (rawDomain.websiteRawContent) {
            const htmlPath = path.resolve(projectDirectory, `websites/${rawDomain.id}.html`);
            const markdownPath = path.resolve(projectDirectory, `websites/${rawDomain.id}.md`);

            if (!useLocalFileCache || !fsSync.existsSync(htmlPath)) {
              await fs.mkdir(path.dirname(htmlPath), { recursive: true });
              await fs.writeFile(htmlPath, rawDomain.websiteRawContent, {});
            }

            if (!useLocalFileCache || !fsSync.existsSync(markdownPath)) {
              try {
                await $({
                  // For whatever reason sometimes the pandoc command is hanging forever, so forcing a timeout to not block next iterations (this one will be reprocessed at another round)
                  // Note: it was pretty hard to detect it when having batching concurrency, the result was just seeable when all processes were hanging (and so we digged into finding the issue cause)
                  timeout: minutesToMilliseconds(3),
                })`pandoc ${htmlPath} --lua-filter ${noImgAndSvgFilterPath} --lua-filter ${extractMetaDescriptionFilterPath} --lua-filter ${removeInlineFileContentFilterPath} -t gfm-raw_html -o ${markdownPath}`;
              } catch (error) {
                // Make sure it's a formatted execa error (ref: https://github.com/sindresorhus/execa/issues/909)
                // Note: for a timeout `error.timedOut` can be true, but sometimes it says it has been killed (`error.killed`)... so just checking the `error.failed` flag
                if (error instanceof Error && !!(error as any).failed && !!(error as any).shortMessage) {
                  const errorMessage = (error as any).shortMessage;

                  await prisma.initiativeMap.update({
                    where: {
                      id: initiativeMap.id,
                    },
                    data: {
                      lastUpdateAttemptWithReachabilityError: new Date(),
                      lastUpdateAttemptReachabilityError: errorMessage,
                    },
                    select: {
                      id: true, // Ref: https://github.com/prisma/prisma/issues/6252
                    },
                  });

                  console.error(`skip processing ${initiativeMap.id} due to an error while doing pandoc analysis on one of its websites`);
                  console.error(errorMessage);

                  return;
                } else {
                  throw error;
                }
              }
            }

            websiteMarkdownContent = await fs.readFile(markdownPath, 'utf-8');
          }

          // Tools used by the website come from the inventory of domains, which is a prerequisite of this step
          const inventory = await prisma.domainInventory.findUnique({
            where: {
              domain: rawDomain.name,
            },
            select: {
              lastCheckAt: true,
              lastCheckError: true,
              DomainTechnology: {
                select: {
                  technology: true,
                },
              },
            },
          });

          if (!inventory?.lastCheckAt) {
            console.log(`skip processing ${initiativeMap.id} since ${rawDomain.name} has not been analyzed yet by the inventory`);

            return;
          } else if (inventory.lastCheckError) {
            await prisma.initiativeMap.update({
              where: {
                id: initiativeMap.id,
              },
              data: {
                lastUpdateAttemptWithReachabilityError: new Date(),
                lastUpdateAttemptReachabilityError: inventory.lastCheckError,
              },
              select: {
                id: true, // Ref: https://github.com/prisma/prisma/issues/6252
              },
            });

            console.error(`skip processing ${initiativeMap.id} due to an error while analyzing one of its websites`);
            console.error(inventory.lastCheckError);

            return;
          }

          const deducedTools: string[] = inventory.DomainTechnology.map((domainTechnology) => domainTechnology.technology);

          mixedInitiativeTools.push(...deducedTools);

          // Register for analysis if valid
          if (websiteMarkdownContent) {
            const websiteTemplate = WebsiteTemplateSchema.parse({
              deducedTools: deducedTools.length > 0 ? deducedTools : null,
              content: websiteMarkdownContent,
            });

            websitesTemplates.push(websiteTemplate);
          }
        }

        for (const [rawRepositoryOnIMapIndex, rawRepositoryOnIMap] of Object.entries(initiativeMap.RawRepositoriesOnInitiativeMaps)) {
          watchGracefulExitInLoop();

          console.log(
            `[${initiativeMap.id}] repository ${rawRepositoryOnIMap.rawRepository.repositoryUrl} ${rawRepositoryOnIMap.main ? '(main)' : ''} (${
              rawRepositoryOnIMap.rawRepository.id
            }) ${formatArrayProgress(rawRepositoryOnIMapIndex, initiativeMap.RawRepositoriesOnInitiativeMaps.length)}`
          );

          const rawRepository = rawRepositoryOnIMap.rawRepository;

          // Get the soure code if not present or "expired"
          const codeFolderPath = path.resolve(projectDirectory, `repositories/${rawRepository.id}/`);
          let codeFolderExists = fsSync.existsSync(codeFolderPath);

          // If the folder is considered too old, we fetch it again
          if (codeFolderExists) {
            const folderInformation = await fs.stat(codeFolderPath);
            const currentDate = new Date();

            if (!useLocalFileCache || differenceInDays(currentDate, folderInformation.birthtime) > 30) {
              // `git clone` cannot be done on an existing folder, so removing it
              await fs.rm(codeFolderPath, { recursive: true, force: true });

              codeFolderExists = false;
            }
          }

          if (!codeFolderExists) {
            console.log(`[${initiativeMap.id}] downloading the repository code`);

            const gitFileSizeLimitInKb: number = 200;

            // `simpleGit` expects the folder to exists already
            await fs.mkdir(codeFolderPath, { recursive: true });

            const projectGit: SimpleGit = simpleGit({
              baseDir: codeFolderPath,
              progress: (event: SimpleGitProgressEvent) => {
                // To not flood we only log a few to notice some progress
                if (event.progress % 20 === 0) {
                  console.log(
                    `[${initiativeMap.id}][${rawRepository.id}] git.${event.method} ${event.stage} stage ${event.progress}% complete (${event.processed}/${event.total})`
                  );
                }
              },
            });

            // We use `git clone` since there is no common pattern to download an archive between all forges (GitHub, GitLab...)
            // We added some parameters to reduce a bit what needs to be downloaded:
            // * `--single-branch`: do not look for information of other branches (it should use the default branch)
            // * `--depth=1`: retrieve only information about the latest commit state (not having history will save space)
            // * `--filter=blob:limit=${SIZE}`: should not download blob objects over $SIZE size (we estimated a size to get big text file for code, while excluding big assets). In fact, it seems not working well because I do see some images fetched... just keeping this parameter in case it may work
            try {
              await projectGit
                .env({
                  GIT_TERMINAL_PROMPT: 0, // This is required so it fails when a repository expects credentials (and so the git CLI expects inputs)
                  GIT_ASKPASS: '', // This is needed because tools and IDE like `vscode` set it and it forces the GUI for credentials despite disabling `GIT_TERMINAL_PROMPT`
                })
                .clone(rawRepository.repositoryUrl, '.', {
                  '--single-branch': null,
                  '--depth': 1,
                  '--filter': `blob:limit=${gitFileSizeLimitInKb}k`,
                });
            } catch (error) {
              try {
                if (error instanceof Error) {
                  if (error.message.includes('terminal prompts disabled') && error.message.includes('could not read Username')) {
                    // This is triggered by the setting `GIT_TERMINAL_PROMPT=0`, it's very likely the repository requires authentication
                    // Since we cannot overcome this, we just skip this repository if there is other content to analyze, otherwise it will put in quarantine the initiative
                    continue;
                  }

                  // `simple-git` does not forward the error code and it would be a bit hard to maintain all possible cases
                  // so for now considering a `git clone` failure like a temporary network issue that we could recover during a future attempt
                  await prisma.initiativeMap.update({
                    where: {
                      id: initiativeMap.id,
                    },
                    data: {
                      lastUpdateAttemptWithReachabilityError: new Date(),
                      lastUpdateAttemptReachabilityError: error.message,
                    },
                    select: {
                      id: true, // Ref: https://github.com/prisma/prisma/issues/6252
                    },
                  });

                  console.error(`skip processing ${initiativeMap.id} due to an error while analyzing one of its repositories`);
                  console.error(error.message);

                  return;
                } else {
                  throw error;
                }
              } finally {
                // To allow retries in case of caching, remove the folder that may be empty
                if (fsSync.existsSync(codeFolderPath)) {
                  await fs.rm(codeFolderPath, { recursive: true, force: true });
                }
              }
            }

            // Do not flood network (tiny delay since it seems GitHub has only limitations on the API requests, no the Git operations)
            // Ref: https://github.com/orgs/community/discussions/44515#discussioncomment-4795475
            await sleep(50);

            // Since Git does not allow using patterns to download only specific files, we just clean the folder after (to have a local disk cache for the next initiative compute before any erase of the data (container restart or manual delete))
            // We remove all files not used during the analysis + `git` data since not used at all
            // Note: the list of patterns must be updated each time new kinds of files to analyze are added
            const folderSizeBeforeClean = await fastFolderSizeAsync(codeFolderPath);
            assert(folderSizeBeforeClean !== undefined);

            // `git ls-files` was returning non-UT8 encoding if it has the default config `core.quotePath = true` (for example `vidéo_48_bicolore.svg` was returned as `vid\303\251o_48_bicolore.svg`),
            // and moreover some filenames were including carriage returns so it was easier to manage Git paths by the null separator
            const lsResult = await projectGit.raw(['ls-files', '-z']);

            if (lsResult !== '') {
              const filesToRemove: string[] = [];

              for (const filePath of lsResult.split('\0')) {
                if (filePath.trim() === '') {
                  // There is an empty line in the output result that cannot be used by `git rm`
                  continue;
                } else if (filePath === '.gitmodules') {
                  // This file references all submodules used in the repository
                  // But since the looped array is sorted alphabetically, the further `git rm xxx` could delete first one of the submodule
                  // which automatically cleans the `.gitmodules`, and delete it if no more entry
                  // This is a problem then if trying to remove `.gitmodules` since no longer existing, so leave it like that (if really containing submodules if will be deleted)
                  continue;
                }

                // To ease future conditions
                const fullFilePath = path.resolve(codeFolderPath, filePath);

                // Keep files having an allowed pattern (since they should have meaningful content to analyze)
                if (
                  !filesToKeepGitEndingPatterns.some((endingPattern): boolean => {
                    if (endingPattern instanceof RegExp) {
                      return endingPattern.test(filePath);
                    } else {
                      return filePath.endsWith(endingPattern);
                    }
                  })
                ) {
                  filesToRemove.push(filePath);
                  continue;
                }

                // Since the `git clone --filter=blob:limit=XXX` seems to only filter specific uploaded assets (not filtering all files over the size limit)
                // we do a manual cleaning of files too big, otherwise since they have an allowed file pattern they would be analzyed and it could take some
                // time in case it's bundled files, minified files... and it would be meaningless to us (even if we may have bundled files with size lower than the limit we set)
                // Note: if the file is a symbolic link there is a high chance it points to nowhere (probably for libraries...), so skipping them to not break things
                const fileStat = await fs.lstat(fullFilePath);
                if (fileStat.isSymbolicLink()) {
                  filesToRemove.push(filePath);
                  continue;
                } else if (fileStat.size > gitFileSizeLimitInKb * bitsFor.KiB) {
                  filesToRemove.push(filePath);
                  continue;
                }

                // After analyzing many repositories it seems programmatic files placed under a `public` or `assets` folder are always about third-party things, so we don't want to analyze them
                // Note: we use the full file path to be sure having the leading "/" (our analyses are under `./data/initiatives/xxx/yyy/` so there is no conflicting folders)
                if (fullFilePath.includes('/public/') || fullFilePath.includes('/assets/')) {
                  filesToRemove.push(filePath);
                  continue;
                }
              }

              if (filesToRemove.length > 0) {
                // We cannot pass the array directly to `projectGit.rm` because if there are too many paths
                // it will throw the error `spawn E2BIG`, meaning the command line is too long for the host system
                // So instead we pass the list through a file (that will get deleted as the rest of unecessary files)
                const filesToDeleteFilePath = path.resolve(codeFolderPath, `./.git/.filestodelete`);

                await fs.writeFile(filesToDeleteFilePath, filesToRemove.join('\0'));
                await projectGit.raw([
                  'rm',
                  '--pathspec-from-file',
                  filesToDeleteFilePath,
                  '--pathspec-file-nul', // This is the only way to deal with repositories having filenames with `\r` or `\n` (to do so we join paths on `\0`)
                  // Some repositories have a diff on binary files (like PDFs) just after cloning which prevents deletion
                  // We thought it came from CRLF or binary settings, but despite trying the config properties `core.autocrlf=false` and `core.fileMode=false` nothing has changed
                  // So just forcing the deletion (example having this issue: https://github.com/mission-apprentissage/mission.apprentissage)
                  '--force',
                ]);
              }
            }

            await $`rm -rf ${path.resolve(codeFolderPath, `./.git/`)}`;

            const folderSizeAfterClean = await fastFolderSizeAsync(codeFolderPath);
            assert(folderSizeAfterClean !== undefined);

            console.log(
              `[${initiativeMap.id}] the repository code has been cleaned (before ${prettyBytes(folderSizeBeforeClean)} | after ${prettyBytes(
                folderSizeAfterClean
              )})`
            );
          }

          // Extract information from the source code
          const codeAnalysisPath = path.resolve(projectDirectory, 'code-analysis.json');

          const { functions, dependencies } = await analyzeWithSemgrep(codeFolderPath, codeAnalysisPath);

          mixedInitiativeTools.push(...dependencies);

          // Get the root README in case it exists
          const readmeEntries = await glob(path.resolve(codeFolderPath, '{README.md,README.txt,README}'), {
            // Note: there is no need of `nocase` because systems were it's run should match despite difference of casing in search criterias
            // nocase: true,
          });
          let readmeContent: string | null = null;
          for (const entry of readmeEntries) {
            const entryContent = await fs.readFile(entry, 'utf-8');

            if (entryContent.trim() !== '') {
              readmeContent = entryContent;
            }
          }

          // Register for analysis if valid
          const repositoryTemplate = RepositoryTemplateSchema.parse({
            functions: functions.length > 0 ? functions : null,
            dependencies: dependencies.length > 0 ? dependencies : null,
            readme: readmeContent || rawRepository.description, // This is rare but if no `README` file we fallback on the description hoping for some context
          });

          repositoriesTemplates.push(repositoryTemplate);
        }

        if (websitesTemplates.length === 0 && repositoriesTemplates.length === 0) {
          await prisma.initiativeMap.update({
            where: {
              id: initiativeMap.id,
            },
            data: {
              lastUpdateAttemptWithReachabilityError: new Date(),
              lastUpdateAttemptReachabilityError: noInitiativeContentToComputeError.code,
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });

          console.error(`skip processing ${initiativeMap.id} due to no content to compute`);

          return;
        }

        // Unique ones
        mixedInitiativeTools = [...new Set(mixedInitiativeTools)];

        // Since properties for websites and repositories are variable in length, and since GPT accepts a maximum of tokens in the context
        // We try with all information and if it's above, we retry with less content until it passes (if it can) because since sorted by main website/repository
        // The algorithm should extract interesting information even without having the whole bunch of information
        let lastChanceAttemptWithOneTruncated = false;
        let failedDueToLlmResponseFormat = 0;

        while (true) {
          // Prepare the content for GPT
          const finalGptContent = initiativeGptTemplate(
            InitiativeTemplateSchema.parse({
              probableInitiativeName: probableInitiativeName,
              resultSchemaDefinition: resultSchemaDefinition,
              websites: websitesTemplates,
              repositories: repositoriesTemplates.map((repositoryTemplate) => {
                // Note: we give priority to website content over repository `README` to not end with meaningless technical things into the initiative description (which should be business-oriented since there is a website)
                return websitesTemplates.length > 0
                  ? RepositoryTemplateSchema.parse({
                      // We make a deepcopy to not mess in case of a next iteration on this initiative
                      functions: repositoryTemplate.functions,
                      dependencies: repositoryTemplate.dependencies,
                      readme: null,
                    })
                  : repositoryTemplate;
              }),
              messageToAppend:
                failedDueToLlmResponseFormat > 0
                  ? t('llm.template.initiative.responseFormatFailures', { count: failedDueToLlmResponseFormat })
                  : undefined,
            })
          );

          try {
            // Process the message if it fits into the LLM limits
            let answerData: ResultSchemaType;
            try {
              answerData = await llmManagerInstance.computeInitiative(settings, projectDirectory, finalGptContent, mixedInitiativeTools);
            } catch (error) {
              if (error === llmResponseFormatError) {
                // Since we cannot force the LLM to return an JSON object exactly, we had to deal with multiple workarounds
                // to handle the LLM returning it with a bad syntax, a bad wrapper... so to not break the next iterations
                failedDueToLlmResponseFormat++;

                // The main idea is to change a part of the prompt hopping the computing will be working (even a letter makes the whole generation different)
                // We give 3 attempts total because maybe there is a case we didn't think about and it would not work forever
                if (failedDueToLlmResponseFormat < 3) {
                  console.warn(`the response format was wrong but we give another try by modifying a bit the prompt`);
                  continue;
                }

                // If after 3 attempts while changing a bit the prompt it's still not passing, we give up and leave it for manual investigation
                // since next batch of processing would do the same since we configured the LLM to be "deterministic" for the same input
                // Note: this is not exactly about a `reachability` error but we reuse this logic
                await prisma.initiativeMap.update({
                  where: {
                    id: initiativeMap.id,
                  },
                  data: {
                    lastUpdateAttemptWithReachabilityError: new Date(),
                    lastUpdateAttemptReachabilityError: llmResponseFormatError.code,
                  },
                  select: {
                    id: true, // Ref: https://github.com/prisma/prisma/issues/6252
                  },
                });

                // we just notify us inside Sentry to fix this case when we can (should be rare among thousands of initiative maps we have)
                Sentry.captureException(error);

                return;
              } else if (
                // We manage 2 cases since MistralAI does not use the same `fetch` when it's a Node.js environment (development) and when it's bundled (like for production) (ref: https://github.com/mistralai/client-js/issues/5#issuecomment-2003801102)
                (error instanceof Error && error.name === 'AbortError') ||
                (error instanceof DOMException && error.code === DOMException.TIMEOUT_ERR) ||
                // This error is when it comes from the server
                (error instanceof Error && (error.cause as any)?.code === 'UND_ERR_CONNECT_TIMEOUT')
              ) {
                await prisma.initiativeMap.update({
                  where: {
                    id: initiativeMap.id,
                  },
                  data: {
                    lastUpdateAttemptWithReachabilityError: new Date(),
                    lastUpdateAttemptReachabilityError: error.message,
                  },
                  select: {
                    id: true, // Ref: https://github.com/prisma/prisma/issues/6252
                  },
                });

                console.error(`skip processing ${initiativeMap.id} due to the computation timing out`);
                console.error(error.message);

                return;
              } else if (error instanceof TypeError && error.message === "Cannot read properties of undefined (reading 'text')") {
                // We tried to detect network errors but the original issue is written in the console but not spreaded to here
                // So using the replacement error, hoping it's always this one for network erros (ref: https://github.com/langchain-ai/langchainjs/issues/4570)
                await prisma.initiativeMap.update({
                  where: {
                    id: initiativeMap.id,
                  },
                  data: {
                    lastUpdateAttemptWithReachabilityError: new Date(),
                    lastUpdateAttemptReachabilityError: error.message,
                  },
                  select: {
                    id: true, // Ref: https://github.com/prisma/prisma/issues/6252
                  },
                });

                console.error(`skip processing ${initiativeMap.id} due to an error while computing its sheet`);
                console.error(error.message);

                return;
              } else {
                throw error;
              }
            }

            // A domain listed as public can have been bought afterwards, the content is the only way to know it. It stays out of the
            // directory until something changes in this initiative map
            if (!answerData.isPublicService && initiativeMapRawDomains.length > 0) {
              console.warn(`[${initiativeMap.id}] skipped since it does not look like a public service ("${answerData.name}")`);

              await prisma.$transaction([
                prisma.initiative.deleteMany({
                  where: {
                    originId: initiativeMap.id,
                  },
                }),
                prisma.initiativeMap.update({
                  where: {
                    id: initiativeMap.id,
                  },
                  data: {
                    update: false,
                    lastUpdateAttemptWithReachabilityError: null,
                    lastUpdateAttemptReachabilityError: null,
                  },
                  select: {
                    id: true, // Ref: https://github.com/prisma/prisma/issues/6252
                  },
                }),
              ]);

              return;
            }

            // Sanitize a bit free entry fields
            answerData.businessUseCases = answerData.businessUseCases.map((businessUseCaseName) => capitalizeFirstLetter(businessUseCaseName.trim()));
            answerData.description = capitalizeFirstLetter(answerData.description.trim());

            // Unique ones
            answerData.businessUseCases = [...new Set(answerData.businessUseCases)];
            answerData.tools = [...new Set(answerData.tools)];

            const sanitizedGptResultPath = path.resolve(projectDirectory, 'sanitized-gpt-result.json');

            const beautifiedAnswerData = JSON.stringify(answerData, null, 2);
            await fs.mkdir(path.dirname(sanitizedGptResultPath), { recursive: true });
            await fs.writeFile(sanitizedGptResultPath, beautifiedAnswerData);

            console.log(`[${initiativeMap.id}] the JSON sanitized result has been written to: ${sanitizedGptResultPath}`);

            // Now prepare and save the results
            const websites = initiativeMapRawDomains.map((rawDomain) => `https://${rawDomain.name}`);
            const repositories = initiativeMap.RawRepositoriesOnInitiativeMaps.map(
              (rawRepositoryOnIMap) => rawRepositoryOnIMap.rawRepository.repositoryUrl
            );
            const functionalUseCases: FunctionalUseCase[] = [];

            if (answerData.functionalUseCases.hasVirtualEmailInboxes) {
              functionalUseCases.push(FunctionalUseCase.HAS_VIRTUAL_EMAIL_INBOXES);
            }
            if (answerData.functionalUseCases.sendsEmails) {
              functionalUseCases.push(FunctionalUseCase.SENDS_EMAILS);
            }
            if (answerData.functionalUseCases.sendsPushNotifications) {
              functionalUseCases.push(FunctionalUseCase.SENDS_PUSH_NOTIFICATIONS);
            }
            if (answerData.functionalUseCases.generatesPDF) {
              functionalUseCases.push(FunctionalUseCase.GENERATES_PDF);
            }
            if (answerData.functionalUseCases.generatesSpreadsheetFile) {
              functionalUseCases.push(FunctionalUseCase.GENERATES_SPREADSHEET_FILE);
            }
            if (answerData.functionalUseCases.hasSearchSystem) {
              functionalUseCases.push(FunctionalUseCase.HAS_SEARCH_SYSTEM);
            }
            if (answerData.functionalUseCases.hasAuthenticationSystem) {
              functionalUseCases.push(FunctionalUseCase.HAS_AUTHENTICATION_SYSTEM);
            }
            if (answerData.functionalUseCases.providesTwoFactorAuthentication) {
              functionalUseCases.push(FunctionalUseCase.PROVIDES_TWO_FACTOR_AUTHENTICATION);
            }
            if (answerData.functionalUseCases.managesFileUpload) {
              functionalUseCases.push(FunctionalUseCase.MANAGES_FILE_UPLOAD);
            }
            if (answerData.functionalUseCases.hasPaymentSystem) {
              functionalUseCases.push(FunctionalUseCase.HAS_PAYMENT_SYSTEM);
            }
            if (answerData.functionalUseCases.hasSeveralLanguagesAvailable) {
              functionalUseCases.push(FunctionalUseCase.HAS_SEVERAL_LANGUAGES_AVAILABLE);
            }
            if (answerData.functionalUseCases.reportsAnalytics) {
              functionalUseCases.push(FunctionalUseCase.REPORTS_ANALYTICS);
            }
            if (answerData.functionalUseCases.reportsErrors) {
              functionalUseCases.push(FunctionalUseCase.REPORTS_ERRORS);
            }
            if (answerData.functionalUseCases.displaysCartographyMap) {
              functionalUseCases.push(FunctionalUseCase.DISPLAYS_CARTOGRAPHY_MAP);
            }
            if (answerData.functionalUseCases.usesArtificialIntelligence) {
              functionalUseCases.push(FunctionalUseCase.USES_ARTIFICIAL_INTELLIGENCE);
            }
            if (answerData.functionalUseCases.exposesApiEndpoints) {
              functionalUseCases.push(FunctionalUseCase.EXPOSES_API_ENDPOINTS);
            }

            await prisma.$transaction(
              async (tx) => {
                // To simplify logic between create/update we retrieve associations to use IDs directly
                const existingToolsInTheDatabase = await tx.tool.findMany({
                  where: {
                    name: {
                      in: answerData.tools,
                      mode: 'insensitive',
                    },
                  },
                  select: {
                    id: true,
                  },
                });

                const existingBusinessUseCasesInTheDatabase = await tx.businessUseCase.findMany({
                  where: {
                    name: {
                      in: answerData.businessUseCases,
                    },
                  },
                  select: {
                    id: true,
                    name: true,
                  },
                });
                let existingBusinessUseCasesNames = existingBusinessUseCasesInTheDatabase.map((bUC) => bUC.name);

                const newBusinessUseCases = answerData.businessUseCases.filter((element) => !existingBusinessUseCasesNames.includes(element));

                const existingInitiative = await tx.initiative.findUnique({
                  where: {
                    originId: initiativeMap.id,
                  },
                  select: {
                    id: true, // Ref: https://github.com/prisma/prisma/issues/6252
                  },
                });

                await tx.initiative.upsert({
                  where: {
                    originId: initiativeMap.id,
                  },
                  update: {
                    name: answerData.name,
                    description: answerData.description,
                    websites: websites,
                    repositories: repositories,
                    functionalUseCases: functionalUseCases,
                    ToolsOnInitiatives: {
                      deleteMany: !!existingInitiative
                        ? {
                            initiativeId: existingInitiative.id,
                            NOT: existingToolsInTheDatabase.map((tool) => ({ toolId: tool.id })),
                          }
                        : undefined,
                      upsert: !!existingInitiative
                        ? existingToolsInTheDatabase.map((tool) => ({
                            where: { toolId_initiativeId: { initiativeId: existingInitiative.id, toolId: tool.id } },
                            update: { toolId: tool.id },
                            create: { toolId: tool.id },
                          }))
                        : undefined,
                    },
                    BusinessUseCasesOnInitiatives: {
                      deleteMany: !!existingInitiative
                        ? {
                            initiativeId: existingInitiative.id,
                            NOT: existingBusinessUseCasesInTheDatabase.map((businessUseCase) => ({ businessUseCaseId: businessUseCase.id })),
                          }
                        : undefined,
                      upsert: !!existingInitiative
                        ? existingBusinessUseCasesInTheDatabase.map((businessUseCase) => ({
                            where: { businessUseCaseId_initiativeId: { initiativeId: existingInitiative.id, businessUseCaseId: businessUseCase.id } },
                            update: { businessUseCaseId: businessUseCase.id },
                            create: {
                              businessUseCase: {
                                connectOrCreate: {
                                  where: { name: businessUseCase.name },
                                  create: { name: businessUseCase.name },
                                },
                              },
                            },
                          }))
                        : undefined,
                      create: newBusinessUseCases.map((businessUseCaseName) => ({
                        businessUseCase: {
                          connectOrCreate: {
                            where: { name: businessUseCaseName },
                            create: { name: businessUseCaseName },
                          },
                        },
                      })),
                    },
                  },
                  create: {
                    origin: {
                      connect: {
                        id: initiativeMap.id,
                      },
                    },
                    name: answerData.name,
                    description: answerData.description,
                    websites: websites,
                    repositories: repositories,
                    functionalUseCases: functionalUseCases,
                    ToolsOnInitiatives: {
                      create: existingToolsInTheDatabase.map((tool) => ({ toolId: tool.id })),
                    },
                    BusinessUseCasesOnInitiatives: {
                      create: answerData.businessUseCases.map((businessUseCaseName) => ({
                        businessUseCase: {
                          connectOrCreate: {
                            where: { name: businessUseCaseName },
                            create: { name: businessUseCaseName },
                          },
                        },
                      })),
                    },
                  },
                });

                await prisma.initiativeMap.update({
                  where: {
                    id: initiativeMap.id,
                  },
                  data: {
                    update: false,
                    lastUpdateAttemptWithReachabilityError: null,
                    lastUpdateAttemptReachabilityError: null,
                  },
                  select: {
                    id: true, // Ref: https://github.com/prisma/prisma/issues/6252
                  },
                });
              },
              {
                timeout: secondsToMilliseconds(30), // Since dealing with a lot of data, prevent closing whereas everything is alright
                isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
              }
            );
          } catch (error) {
            if (error === tokensReachTheLimitError) {
              // We try with less information if possible
              // (we try to remove 1 by 1 on each, but the main last one important is the website for business context on the initiative)
              if (repositoriesTemplates.length >= websitesTemplates.length) {
                if (!lastChanceAttemptWithOneTruncated && repositoriesTemplates.length === 1 && websitesTemplates.length === 0) {
                  // It seems even with only 1 repository it does not work so we truncate
                  // because if the content is huge there is a low probability everything is meaningful
                  lastChanceAttemptWithOneTruncated = true;

                  // Ideally we could almost go to the limit `this.gptInstance.modelTokenLimit` but for this we should take in account
                  // the full templating for this repository because it will include deduced tools and some sentences from the template
                  // But we are fine we a lower arbitrary limit because it's high probable the content is not meaningful enough since only 1 repository to analyze with a long content
                  if (!!repositoriesTemplates[0].readme) {
                    repositoriesTemplates[0].readme = llmManagerInstance.truncateContentBasedOnTokens(repositoriesTemplates[0].readme, 5000);
                  }
                  repositoriesTemplates[0].dependencies = repositoriesTemplates[0].dependencies
                    ? repositoriesTemplates[0].dependencies.slice(0, 100)
                    : null;
                  repositoriesTemplates[0].functions = repositoriesTemplates[0].functions ? repositoriesTemplates[0].functions.slice(0, 100) : null;

                  console.log(`[${initiativeMap.id}] the next retry will be with repository readme content truncated`);

                  continue;
                }

                repositoriesTemplates.pop();
              } else {
                if (!lastChanceAttemptWithOneTruncated && websitesTemplates.length === 1) {
                  // It seems even with only 1 website it does not work so we truncate
                  // because if the content is huge there is a low probability everything is meaningful
                  lastChanceAttemptWithOneTruncated = true;

                  // Ideally we could almost go to the limit `this.gptInstance.modelTokenLimit` but for this we should take in account
                  // the full templating because it will include deduced tools and some sentences from the template
                  // But we are fine we a lower arbitrary limit because it's high probable the content is not meaningful enough since only 1 website to analyze with a long content
                  websitesTemplates[0].content = llmManagerInstance.truncateContentBasedOnTokens(websitesTemplates[0].content, 5000);
                  websitesTemplates[0].deducedTools = websitesTemplates[0].deducedTools ? websitesTemplates[0].deducedTools.slice(0, 100) : null;

                  console.log(`[${initiativeMap.id}] the next retry will be with website content truncated`);

                  continue;
                }

                websitesTemplates.pop();
              }

              if (repositoriesTemplates.length === 0 && websitesTemplates.length === 0) {
                throw new Error(
                  `[${initiativeMap.id}] initiative has no repository or website to compute, it must be investigated to handle this case`
                );
              }

              console.log(`[${initiativeMap.id}] retrying with less information`);

              continue;
            } else {
              throw error;
            }
          }

          break; // When successful break the infinite loop
        }

        // Do not flood network (tiny since MistralAI limits us to 5req/s but since the generation usually takes more than a second we are fine)
        // (if needed in the future we could look at their rate limit information in headers to wait the appropriate amount of time to retry)
        await sleep(50);
      } catch (error) {
        // Due to concurrency it's easier for us to log which initiative map is having the error
        console.log(`[${initiativeMap.id}] something went wrong, it will stop all workers`);

        throw error;
      } finally {
        // [WORKAROUND] The first idea was to keep everything local but even after cleaning the repositories it seems some are still
        // huge enough to fill the storage, and since the provider does not provide the clear available storage, we make sure to not be killed due to that (set to false to debug)
        if (!!true) {
          await $`rm -rf ${path.resolve(projectDirectory, `./`)}`;
        }
      }
    });

    // After computing the new or updated sheets, we make sure to delete the older ones that were kept to make the bridge
    // between the time new initiative maps were calculated, and the time to compute modified groups (otherwise in the meantime there is a risk the product is not indexed on the platform)
    await prisma.initiative.deleteMany({
      where: {
        origin: {
          is: null,
        },
      },
    });

    console.log(`the old initiatives no longer part of newly computed initiative maps have been deleted`);
  } catch (error) {
    console.error(`error while feeding initiatives`);

    if (error instanceof OpenAI.APIError) {
      console.error(error.status);
      console.error(error.name);

      throw error;
    } else {
      console.error(error);

      throw error;
    }
  }
}

export async function runInitiativeAssistant() {
  const settings = await prisma.settings.findUniqueOrThrow({
    where: {
      onlyTrueAsId: true,
    },
  });

  await llmManagerInstance.assertInitiativesDocumentsAreReady(settings);

  const sessionId = uuidv4();
  const streamAnswer = true;
  const eventEmitter: ChunkEventEmitter = new EventEmitter<'chunk', number>();

  eventEmitter.on('chunk', (chunk) => {
    process.stdout.write(chalk.green.bold(chunk));
  });

  try {
    console.log(
      chalk.green.bold(
        `
Hello, I'm here to assist you in retrieving public french initatives.

Could you give me some context on what you are looking for?
\n`.trimStart()
      )
    );

    while (true) {
      const userInput = await input({
        message: chalk.green.bold('\t'),
      });

      console.log('\n');

      // Request the assistant
      const assistantAnswer = await llmManagerInstance.requestAssistant(settings, sessionId, userInput, eventEmitter);

      // When it's streaming that's the listening callback of the `eventEmitter` that will manage outputting the message
      if (!streamAnswer) {
        process.stdout.write(chalk.green.bold(assistantAnswer));
      }

      process.stdout.write('\n\n\n');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('User force closed the prompt')) {
      console.log(chalk.green.bold('\n\nBye bye!'));
    } else {
      throw error;
    }
  } finally {
    eventEmitter && eventEmitter.removeAllListeners();
  }
}
