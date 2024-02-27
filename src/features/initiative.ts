import { input } from '@inquirer/prompts';
import { FunctionalUseCase, Prisma, RawDomain, RawRepository } from '@prisma/client';
import assert from 'assert';
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
import { simpleGit } from 'simple-git';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import Wappalyzer from 'wappalyzer';

import manifestsEndingPatterns from '@etabli/src/bibliothecary/manifests-patterns.json';
import { ChunkEventEmitter, llmManagerInstance } from '@etabli/src/features/llm';
import {
  InitiativeTemplateSchema,
  RepositoryTemplateSchema,
  RepositoryTemplateSchemaType,
  ResultSchemaType,
  WebsiteTemplateSchema,
  WebsiteTemplateSchemaType,
  resultSchemaDefinition,
} from '@etabli/src/gpt/template';
import { tokensReachTheLimitError } from '@etabli/src/models/entities/errors';
import { LiteInitiativeMapSchema, LiteInitiativeMapSchemaType } from '@etabli/src/models/entities/initiative';
import { prisma } from '@etabli/src/prisma';
import { analyzeWithSemgrep } from '@etabli/src/semgrep/index';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { getListDiff } from '@etabli/src/utils/comparaison';
import { capitalizeFirstLetter, formatArrayProgress } from '@etabli/src/utils/format';
import { languagesExtensions } from '@etabli/src/utils/languages';
import { sleep } from '@etabli/src/utils/sleep';
import { WappalyzerResultSchema } from '@etabli/src/wappalyzer';

const __root_dirname = process.cwd();

const fastFolderSizeAsync = promisify(fastFolderSize);
const useLocalFileCache = true; // Switch it when testing locally to prevent multiplying network request whereas the remote content has probably no change since then

const git = simpleGit();
const filesToKeepGitEndingPatterns: string[] = [
  // This is used to reduce size of the repository once downloaded
  // Notes:
  // - only keep programming files and manifests since that what we only use for now (in addition to README files)
  // - with the current patterns we cannot rely on using leading `/` for the root, we should convert them to regexp otherwise
  'README',
  'README.md',
  ...manifestsEndingPatterns,
  ...languagesExtensions,
];

const noImgAndSvgFilterPath = path.resolve(__root_dirname, './src/pandoc/no-img-and-svg.lua');
const extractMetaDescriptionFilterPath = path.resolve(__root_dirname, './src/pandoc/extract-meta-description.lua');

const wappalyzer = new Wappalyzer({
  debug: false,
  delay: 1000,
  headers: {},
  maxDepth: 1,
  maxUrls: 10,
  maxWait: 10000,
  recursive: true,
  probe: true,
  userAgent: 'Wappalyzer',
  htmlMaxCols: 2000,
  htmlMaxRows: 2000,
  noRedirect: true,
});

export type NodeLabel =
  | {
      type: 'domain';
      entity: Pick<RawDomain, 'id' | 'name'>;
    }
  | {
      type: 'repository';
      entity: Pick<RawRepository, 'id' | 'repositoryUrl'>;
    };

export async function inferInitiativesFromDatabase() {
  // TODO: should it be locked globally? But it should be a be long to compute... at risk since a lot of records to fetch/process/update

  console.log(`starting the process of inferring initiative maps`);

  const rawDomainCriterias: Prisma.RawDomainWhereInput = {
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

  const rawRepositories = await prisma.rawRepository.findMany({
    where: rawRepositoryCriterias,
    select: {
      id: true,
      repositoryUrl: true,
      homepage: true,
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

  console.log(`inferring according to ${rawDomains.length} raw domains and ${rawRepositories.length} raw repositories`);

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
    for (const similarDomain of rawDomain.similarDomains) {
      graph.setEdge(similarDomain.id, rawDomain.id, 1 / 1);
    }
  }

  for (const rawRepository of rawRepositories) {
    graph.setNode(rawRepository.id, {
      type: 'repository',
      entity: rawRepository,
    } as NodeLabel);

    // If will create the node with only "id" if not existing, and over next iterations it will put details onto it
    for (const similarRepository of rawRepository.similarRepositories) {
      graph.setEdge(similarRepository.id, rawRepository.id, 1 / 1);
    }
  }

  // Create all edges between pair of nodes with a scoring on edges
  for (const rawDomain of rawDomains) {
    // Then, to repositories
    for (const rawRepository of rawRepositories) {
      let score: number = 0;

      if (!!rawDomain.probableRepositoryUrl && rawDomain.probableRepositoryUrl === rawRepository.homepage) {
        score += 2;
      }

      if (rawDomain.name === rawRepository.probableWebsiteDomain) {
        score += 2;
      }

      if (score > 0) {
        graph.setEdge(rawRepository.id, rawDomain.id, 1 / score);
      }
    }
  }

  // To debug it may be useful to print a global JSON representation
  if (!!false) {
    const jsonContent = graphlib.json.write(graph);
    const jsonPath = path.resolve(__root_dirname, './data/graph.json');

    await fs.writeFile(jsonPath, JSON.stringify(jsonContent, null, 2));
  }

  console.log(`building initiative map groups by using a graph of nodes`);

  // Each initiative map is defined by a ending node (corresponding to the top parent)
  const sinkNodesIds = graph.sinks();
  const initiativeMapsWithLabels = graph.sinks().map((endingNodeId) => {
    const endingNode = graph.node(endingNodeId) as NodeLabel;
    assert(endingNode);

    return {
      mainItem: endingNode,
      items: [endingNode],
    };
  });

  const nodes = graph.nodes();
  const nodesToBind = nodes.filter((nodeId) => !sinkNodesIds.includes(nodeId));

  console.log(`${nodesToBind.length} of ${nodes.length} nodes need a calculation to be bound to a parent`);

  // Each node must be associated with the closest sink (closest top parent)
  for (const [nodeIdIndex, nodeId] of Object.entries(nodesToBind)) {
    console.log(`looking for the closest parent node for the entity ${nodeId} ${formatArrayProgress(nodeIdIndex, nodesToBind.length)}`);

    const destinationPaths = graphlib.alg.dijkstra(graph, nodeId);

    const sortedFinalPaths = Object.entries(destinationPaths)
      .filter(([destinationNodeId]) => {
        return sinkNodesIds.includes(destinationNodeId); // Only consider ending nodes
      })
      .sort(([, destinationMetricsA], [, destinationMetricsB]) => {
        return destinationMetricsA.distance - destinationMetricsB.distance; // Ascending
      });

    if (sortedFinalPaths.length > 0) {
      const [closestSinkNodeId] = sortedFinalPaths[0];
      const initiativeMapWithLabels = initiativeMapsWithLabels.find((iMap) => {
        return iMap.mainItem.entity.id === closestSinkNodeId;
      });
      assert(initiativeMapWithLabels);

      const node = graph.node(nodeId) as NodeLabel;
      assert(node);

      initiativeMapWithLabels.items.push(node);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      const storedInitiativeMaps = await tx.initiativeMap.findMany({
        where: {
          deletedAt: null,
        },
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
      const storedLiteInitiativeMaps = storedInitiativeMaps.map((initiativeMap) =>
        LiteInitiativeMapSchema.parse({
          mainItemIdentifier: initiativeMap.mainItemIdentifier,
          rawDomainsIds: initiativeMap.RawDomainsOnInitiativeMaps.map((rawDomainOnIMap) => rawDomainOnIMap.rawDomainId),
          rawRepositoriesIds: initiativeMap.RawRepositoriesOnInitiativeMaps.map((rawRepositoryOnIMap) => rawRepositoryOnIMap.rawRepositoryId),
        })
      );
      const computedLiteInitiativeMaps = initiativeMapsWithLabels.map((initiativeMapWithLabels) => {
        const rawDomainsIds: string[] = [];
        const rawRepositoriesIds: string[] = [];

        for (const item of initiativeMapWithLabels.items) {
          if (item.type === 'domain') {
            rawDomainsIds.push(item.entity.id);
          } else {
            rawRepositoriesIds.push(item.entity.id);
          }
        }

        return LiteInitiativeMapSchema.parse({
          mainItemIdentifier: initiativeMapWithLabels.mainItem.entity.id,
          rawDomainsIds: rawDomainsIds,
          rawRepositoriesIds: rawRepositoriesIds,
        });
      });

      console.log(`${computedLiteInitiativeMaps.length} initiative maps remain after grouping the nodes`);

      const diffResult = getListDiff(storedLiteInitiativeMaps, computedLiteInitiativeMaps, {
        referenceProperty: 'mainItemIdentifier',
      });

      let anyChange = false;
      for (const diffItem of diffResult.diff) {
        watchGracefulExitInLoop();

        if (diffItem.status === 'added') {
          const liteInitiativeMap = diffItem.value as LiteInitiativeMapSchemaType;
          anyChange = true;

          await tx.initiativeMap.create({
            data: {
              mainItemIdentifier: liteInitiativeMap.mainItemIdentifier,
              update: true,
              lastUpdateAttemptWithReachabilityError: null,
              lastUpdateAttemptReachabilityError: null,
              RawDomainsOnInitiativeMaps: {
                createMany: {
                  skipDuplicates: true,
                  data: liteInitiativeMap.rawDomainsIds.map((rawDomainId) => {
                    return {
                      rawDomainId: rawDomainId,
                      main: liteInitiativeMap.mainItemIdentifier === rawDomainId,
                    };
                  }),
                },
              },
              RawRepositoriesOnInitiativeMaps: {
                createMany: {
                  skipDuplicates: true,
                  data: liteInitiativeMap.rawRepositoriesIds.map((rawRepositoryId) => {
                    return {
                      rawRepositoryId: rawRepositoryId,
                      main: liteInitiativeMap.mainItemIdentifier === rawRepositoryId,
                    };
                  }),
                },
              },
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });
        } else if (diffItem.status === 'deleted') {
          const liteInitiativeMap = diffItem.value as LiteInitiativeMapSchemaType;
          anyChange = true;

          // We do not delete to keep a bit of history for debug
          const deletedInitiativeMap = await tx.initiativeMap.updateMany({
            where: {
              mainItemIdentifier: liteInitiativeMap.mainItemIdentifier,
              deletedAt: null,
            },
            data: {
              deletedAt: new Date(),
            },
          });
        } else if (diffItem.status === 'updated') {
          const liteInitiativeMap = diffItem.value as LiteInitiativeMapSchemaType;
          anyChange = true;

          // Since we cannot make a unique tuple with `deletedAt` we have a hack a bit and take the last one first
          const initiativeMapToUpdate = await tx.initiativeMap.findFirstOrThrow({
            where: {
              mainItemIdentifier: liteInitiativeMap.mainItemIdentifier,
              deletedAt: null,
            },
            select: {
              id: true,
            },
            orderBy: {
              updatedAt: 'desc',
            },
          });

          const updatedInitiativeMap = await tx.initiativeMap.update({
            where: {
              id: initiativeMapToUpdate.id,
            },
            data: {
              update: true,
              RawDomainsOnInitiativeMaps: {
                set: liteInitiativeMap.rawDomainsIds.map((rawDomainId) => {
                  return {
                    rawDomainId: rawDomainId,
                  };
                }),
              },
              RawRepositoriesOnInitiativeMaps: {
                set: liteInitiativeMap.rawRepositoriesIds.map((rawRepositoryId) => {
                  return {
                    rawRepositoryId: rawRepositoryId,
                  };
                }),
              },
            },
            select: {
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

          // Since we were not able to update the `main` property with `.set` property, we do it in a second time
          await tx.initiativeMap.update({
            where: {
              id: initiativeMapToUpdate.id,
            },
            data: {
              RawDomainsOnInitiativeMaps: {
                updateMany: updatedInitiativeMap.RawDomainsOnInitiativeMaps.map((rawDomainOnIMap) => {
                  return {
                    where: {
                      rawDomainId: rawDomainOnIMap.rawDomainId,
                    },
                    data: {
                      main: rawDomainOnIMap.rawDomainId === updatedInitiativeMap.mainItemIdentifier,
                    },
                  };
                }),
              },
              RawRepositoriesOnInitiativeMaps: {
                updateMany: updatedInitiativeMap.RawRepositoriesOnInitiativeMaps.map((rawRepositoryOnIMap) => {
                  return {
                    where: {
                      rawRepositoryId: rawRepositoryOnIMap.rawRepositoryId,
                    },
                    data: {
                      main: rawRepositoryOnIMap.rawRepositoryId === updatedInitiativeMap.mainItemIdentifier,
                    },
                  };
                }),
              },
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });
        }

        if (anyChange) {
          // There is a modification so on the next job we should tell the LLM system about new updates
          await prisma.settings.update({
            where: {
              onlyTrueAsId: true,
            },
            data: {
              updateIngestedInitiatives: true,
            },
          });
        }
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
      deletedAt: null,
      AND: {
        OR: [
          {
            lastUpdateAttemptWithReachabilityError: {
              equals: null,
            },
          },
          {
            lastUpdateAttemptWithReachabilityError: {
              lt: subDays(new Date(), 1), // Skip rows with high probability of failure since they had recently a network reachability issue
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

  try {
    await wappalyzer.init();

    // Prepare the message template used to ask GPT about the initiative
    const initiativeGptTemplateContent = await fs.readFile(path.resolve(__root_dirname, './src/gpt/templates/initiative.md'), 'utf-8');
    const websiteGptTemplateContent = await fs.readFile(path.resolve(__root_dirname, './src/gpt/templates/website.md'), 'utf-8');
    const repositoryGptTemplateContent = await fs.readFile(path.resolve(__root_dirname, './src/gpt/templates/repository.md'), 'utf-8');

    handlebars.registerPartial('websitePartial', websiteGptTemplateContent);
    handlebars.registerPartial('repositoryPartial', repositoryGptTemplateContent);

    const initiativeGptTemplate = handlebars.compile(initiativeGptTemplateContent);

    // To debug easily we write each result on disk (also, since using lot of CLIs we have no other choice :D)
    for (const [initiativeMapIndex, initiativeMap] of Object.entries(initiativeMaps)) {
      watchGracefulExitInLoop();

      console.log(`feed initiative ${initiativeMap.id} ${formatArrayProgress(initiativeMapIndex, initiativeMaps.length)}`);

      const projectDirectory = path.resolve(__root_dirname, './data/initiatives/', initiativeMap.id);

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
      let initiativeName: string;
      if (initiativeMap.RawDomainsOnInitiativeMaps.length > 0 && initiativeMap.RawDomainsOnInitiativeMaps[0].main) {
        const mainRawDomain = initiativeMapRawDomains.find((rd) => rd.id === initiativeMap.RawDomainsOnInitiativeMaps[0].rawDomainId);
        assert(mainRawDomain);

        initiativeName = mainRawDomain.websiteInferredName || mainRawDomain.name;
      } else if (initiativeMap.RawRepositoriesOnInitiativeMaps.length > 0 && initiativeMap.RawRepositoriesOnInitiativeMaps[0].main) {
        initiativeName = initiativeMap.RawRepositoriesOnInitiativeMaps[0].rawRepository.name;
      } else {
        throw new Error('initiative name cannot be inferred');
      }

      let mixedInitiativeTools: string[] = [];
      for (const [rawDomainOnIMapIndex, rawDomainOnIMap] of Object.entries(initiativeMap.RawDomainsOnInitiativeMaps)) {
        watchGracefulExitInLoop();

        const rawDomain = initiativeMapRawDomains.find((rd) => rd.id === rawDomainOnIMap.rawDomainId);
        assert(rawDomain);

        console.log(
          `domain ${rawDomain.name} ${rawDomainOnIMap.main ? '(main)' : ''} (${rawDomain.id}) ${formatArrayProgress(
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
            await $`pandoc ${htmlPath} --lua-filter ${noImgAndSvgFilterPath} --lua-filter ${extractMetaDescriptionFilterPath} -t gfm-raw_html -o ${markdownPath}`;
          }

          websiteMarkdownContent = await fs.readFile(markdownPath, 'utf-8');
        }

        // Try to deduce tools used from the frontend
        const wappalyzerAnalysisPath = path.resolve(projectDirectory, 'wappalyzer-analysis.json');

        if (!useLocalFileCache || !fsSync.existsSync(wappalyzerAnalysisPath)) {
          const headers = {};
          const storage = {
            local: {},
            session: {},
          };
          const site = await wappalyzer.open(`https://${rawDomain.name}`, headers, storage);

          const results = await site.analyze();

          await fs.mkdir(path.dirname(wappalyzerAnalysisPath), { recursive: true });
          await fs.writeFile(wappalyzerAnalysisPath, JSON.stringify(results, null, 2));

          // Wait a bit in case websites from this initiative are on the same servers (tiny delay in this loop because)
          await sleep(50);
        }

        const wappalyzerAnalysisDataString = await fs.readFile(wappalyzerAnalysisPath, 'utf-8');
        const wappalyzerAnalysisDataObject = JSON.parse(wappalyzerAnalysisDataString);
        const wappalyzerAnalysisData = WappalyzerResultSchema.parse(wappalyzerAnalysisDataObject);

        const deducedTools: string[] = wappalyzerAnalysisData.technologies
          .filter((technology) => {
            // Set a minimum so uncertain tools like backend ones for compilation are ignored
            return technology.confidence >= 75;
          })
          .map((technology) => technology.name);

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
          `repository ${rawRepositoryOnIMap.rawRepository.repositoryUrl} ${rawRepositoryOnIMap.main ? '(main)' : ''} (${
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
          console.log('downloading the repository code');

          // We use `git clone` since there is no common pattern to download an archive between all forges (GitHub, GitLab...)
          // We added some parameters to reduce a bit what needs to be downloaded:
          // * `--single-branch`: do not look for information of other branches (it should use the default branch)
          // * `--depth=1`: retrieve only information about the latest commit state (not having history will save space)
          // * `--filter=blob:limit=${SIZE}`: should not download blob objects over $SIZE size (we estimated a size to get big text file for code, while excluding big assets). In fact, it seems not working well because I do see some images fetched... just keeping this parameter in case it may work
          await git.clone(rawRepository.repositoryUrl, codeFolderPath, {
            '--single-branch': null,
            '--depth': 1,
            '--filter': 'blob:limit=200k',
          });

          // Do not flood network (tiny delay since it seems GitHub has only limitations on the API requests, no the Git operations)
          // Ref: https://github.com/orgs/community/discussions/44515#discussioncomment-4795475
          await sleep(50);

          // Since Git does not allow using patterns to download only specific files, we just clean the folder after (to have a local disk cache for the next initiative compute before any erase of the data (container restart or manual delete))
          // We remove all files not used during the analysis + `git` data since not used at all
          // Note: the list of patterns must be updated each time new kinds of files to analyze are added
          const folderSizeBeforeClean = await fastFolderSizeAsync(codeFolderPath);
          assert(folderSizeBeforeClean !== undefined);

          const projectGit = git.cwd({ path: codeFolderPath });

          // `git ls-files` was returning non-UT8 encoding if it has the default config `core.quotePath = true` (for example `vidéo_48_bicolore.svg` was returned as `vid\303\251o_48_bicolore.svg`)
          // so forcing displaying verbatim paths with `-z`. We did not change `core.quotePath` because it would modify the host git config resulting a side-effects potentially
          const lsResult = await projectGit.raw(['ls-files', '-z']);

          if (lsResult !== '') {
            const filesToRemove = lsResult.split('\0').filter((filePath) => {
              // There is an empty line in the output result that cannot be used by `git rm`
              if (filePath.trim() === '') {
                return false;
              }

              return !filesToKeepGitEndingPatterns.some((endingPattern) => {
                return filePath.endsWith(endingPattern);
              });
            });

            if (filesToRemove.length > 0) {
              await projectGit.rm(filesToRemove);
            }
          }

          await $`rm -rf ${path.resolve(codeFolderPath, `./.git/`)}`;

          const folderSizeAfterClean = await fastFolderSizeAsync(codeFolderPath);
          assert(folderSizeAfterClean !== undefined);

          console.log(
            `the repository code has been cleaned (before ${prettyBytes(folderSizeBeforeClean)} | after ${prettyBytes(folderSizeAfterClean)})`
          );
        }

        // Extract information from the source code
        const codeAnalysisPath = path.resolve(projectDirectory, 'code-analysis.json');

        const { functions, dependencies } = await analyzeWithSemgrep(codeFolderPath, codeAnalysisPath);

        mixedInitiativeTools.push(...dependencies);

        // Get README in case it exists
        const readmeEntries = await glob(path.resolve(codeFolderPath, '{README.md,README.txt,README}'));
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
        throw new Error('this initiative must have items');
      }

      // Unique ones
      mixedInitiativeTools = [...new Set(mixedInitiativeTools)];

      // Since properties for websites and repositories are variable in length, and since GPT accepts a maximum of tokens in the context
      // We try with all information and if it's above, we retry with less content until it passes (if it can) because since sorted by main website/repository
      // The algorithm should extract interesting information even without having the whole bunch of information
      while (true) {
        // Prepare the content for GPT
        const finalGptContent = initiativeGptTemplate(
          InitiativeTemplateSchema.parse({
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
          })
        );

        try {
          // Process the message if it fits into the LLM limits
          let answerData: ResultSchemaType = await llmManagerInstance.computeInitiative(
            settings,
            projectDirectory,
            finalGptContent,
            mixedInitiativeTools
          );

          // Sanitize a bit free entry fields
          answerData.businessUseCases = answerData.businessUseCases.map((businessUseCaseName) => capitalizeFirstLetter(businessUseCaseName.trim()));
          answerData.description = capitalizeFirstLetter(answerData.description.trim());

          const sanitizedGptResultPath = path.resolve(projectDirectory, 'sanitized-gpt-result.json');

          const beautifiedAnswerData = JSON.stringify(answerData, null, 2);
          await fs.mkdir(path.dirname(sanitizedGptResultPath), { recursive: true });
          await fs.writeFile(sanitizedGptResultPath, beautifiedAnswerData);

          console.log(`the JSON sanitized result has been written to: ${sanitizedGptResultPath}`);
          console.log('\n');
          console.log('\n');

          // Now prepare and save the results
          const websites = initiativeMapRawDomains.map((rawDomain) => `https://${rawDomain.name}`);
          const repositories = initiativeMap.RawRepositoriesOnInitiativeMaps.map(
            (rawRepositoryOnIMap) => rawRepositoryOnIMap.rawRepository.repositoryUrl
          );
          const functionalUseCases: FunctionalUseCase[] = [];

          if (answerData.functionalUseCases.generatesPDF) {
            functionalUseCases.push(FunctionalUseCase.GENERATES_PDF);
          }
          if (answerData.functionalUseCases.hasVirtualEmailInboxes) {
            functionalUseCases.push(FunctionalUseCase.HAS_VIRTUAL_EMAIL_INBOXES);
          }
          if (answerData.functionalUseCases.sendsEmails) {
            functionalUseCases.push(FunctionalUseCase.SENDS_EMAILS);
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

              const newBusinessUseCases = answerData.businessUseCases.filter(
                (element) => !existingBusinessUseCasesInTheDatabase.map((bUC) => bUC.name).includes(element)
              );

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
                  name: initiativeName,
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
                  name: initiativeName,
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
              repositoriesTemplates.pop();
            } else {
              websitesTemplates.pop();
            }

            if (repositoriesTemplates.length === 0 && websitesTemplates.length === 0) {
              throw new Error(
                'initative with only a website should pass in the context, this case has not been handled yet, maybe we could truncate the website content so it passes?'
              );
            }

            console.log('retrying with less information');

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
    }
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.log(error.status);
      console.log(error.name);

      throw error;
    } else {
      throw error;
    }
  } finally {
    let wappalyzerClosedNormally = false;

    // For whatever reason despite the official documentation when doing it it may hang forever (ref: https://github.com/enthec/webappanalyzer/issues/74)
    // If not done the program may not quit (it's random), and if done it may be stuck on it... an acceptable workaround is to set a timeout
    // Note: `Promise.race` was not working by using directly async functions so we used promises (maybe due to the `finally` block? Weird...)
    await Promise.race([
      new Promise<void>(async (resolve) => {
        await wappalyzer.destroy();

        wappalyzerClosedNormally = true;

        resolve();
      }),
      new Promise<void>(async (resolve) => {
        await sleep(4000);

        if (!wappalyzerClosedNormally) {
          console.warn('wappalyzer seems stuck closing, you may have to force terminating the program if it seems to hang forever');
        }

        resolve();
      }),
    ]);
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
