import { Prisma, RawDomain, RawRepository } from '@prisma/client';
import assert from 'assert';
import graphlib, { Graph } from 'graphlib';

import { LiteInitiativeMapSchema, LiteInitiativeMapSchemaType } from '@etabli/models/entities/initiative';
import { prisma } from '@etabli/prisma';
import { getListDiff } from '@etabli/utils/comparaison';

export type NodeLabel =
  | {
      type: 'domain';
      entity: RawDomain;
    }
  | {
      type: 'repository';
      entity: RawRepository;
    };

export async function inferInitiativesFromDatabase() {
  // TODO: should it be locked globally? But it should be a be long to compute... at risk since a lot of records to fetch/process/update

  const rawDomains = await prisma.rawDomain.findMany({
    where: {
      indexableFromRobotsTxt: true, // Websites marked to not be indexed should not end into Etabli, moreover it helps not indexing tools like Grafana...
      websiteContentIndexable: true, // Same as above
      websiteHasContent: true, // When if the page returns no visible text content, we skip it
      websiteHasStyle: true, // A website not having style in 2023+ is likely a test or exposing raw API data
      redirectDomainTarget: null, // A redirecting website won't be processed since we cannot guarantee the new location, we expect the target domain to be added to our source dataset
    },
    include: {
      similarDomains: true,
    },
    orderBy: {
      createdAt: 'asc', // To keep similar order in logs across runs, and guarantee similar processing for graph logic below
    },
  });

  const rawRepositories = await prisma.rawRepository.findMany({
    where: {
      isFork: {
        not: true, // It's rare fork are dedicated new products (even more since GitHub allows "templates" now for project stacks)
      },
    },
    include: {
      similarRepositories: true,
    },
    orderBy: {
      createdAt: 'asc', // To keep similar order in logs across runs, and guarantee similar processing for graph logic below
    },
  });

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

  // Each node must be associated with the closest sink (closest top parent)
  for (const nodeId of graph.nodes()) {
    if (sinkNodesIds.includes(nodeId)) {
      // We do not reprocess this one
      continue;
    }

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
        include: {
          RawDomainsOnInitiativeMaps: true,
          RawRepositoriesOnInitiativeMaps: true,
        },
      });

      // To make the diff we compare only meaningful properties
      const storedLiteInitiativeMaps = storedInitiativeMaps.map((initiativeMap) =>
        LiteInitiativeMapSchema.parse({
          mainItemIdentifier: initiativeMap.mainItemIdentifier,
          rawDomainsIds: initiativeMap.RawDomainsOnInitiativeMaps.map((rawDomain) => rawDomain.rawDomainId),
          rawRepositoriesIds: initiativeMap.RawRepositoriesOnInitiativeMaps.map((rawRepository) => rawRepository.rawRepositoryId),
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

      const diffResult = getListDiff(storedLiteInitiativeMaps, computedLiteInitiativeMaps);

      for (const diffItem of diffResult.diff) {
        if (diffItem.status === 'added') {
          const liteInitiativeMap = diffItem.value as LiteInitiativeMapSchemaType;

          await tx.initiativeMap.create({
            data: {
              mainItemIdentifier: liteInitiativeMap.mainItemIdentifier,
              update: true,
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
          });
        } else if (diffItem.status === 'deleted') {
          const liteInitiativeMap = diffItem.value as LiteInitiativeMapSchemaType;

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

          // Since we cannot make a unique tuple with `deletedAt` we have a hack a bit and take the last one first
          const initiativeMapToUpdate = await tx.initiativeMap.findFirstOrThrow({
            where: {
              mainItemIdentifier: liteInitiativeMap.mainItemIdentifier,
              deletedAt: null,
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
            include: {
              RawDomainsOnInitiativeMaps: true,
              RawRepositoriesOnInitiativeMaps: true,
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
          });
        }
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}
