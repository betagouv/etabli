import { Job } from 'pg-boss';

import { enhanceDomainsIntoDatabase, formatDomainsIntoDatabase, saveDomainCsvFile } from '@etabli/src/features/domain';
import { updateDomainsInventory } from '@etabli/src/features/domain-inventory';
import { updateInitiativesReputation } from '@etabli/src/features/domain-reputation';
import { feedInitiativesFromDatabase, inferInitiativesFromDatabase } from '@etabli/src/features/initiative';
import { ingestInitiativeListToLlmSystem, ingestToolListToLlmSystem } from '@etabli/src/features/llm';
import { bindOrganizationsToInitiatives, formatOrganizationsIntoDatabase, saveOrganizationListFile } from '@etabli/src/features/organization';
import { enhanceRepositoriesIntoDatabase, formatRepositoriesIntoDatabase, saveRepositoryListFile } from '@etabli/src/features/repository';
import { formatRepositoryOrganizationsIntoDatabase, saveRepositoryOrganizationListFile } from '@etabli/src/features/repository-organization';
import { enhanceToolsIntoDatabase, formatToolsIntoDatabase, saveToolCsvFile } from '@etabli/src/features/tool';

export const updateEntitiesDataTopic = 'update-entities-data';

export async function updateEntitiesData(job: Job<void>) {
  // The following will perform end-to-end update for any data needed to compute initiatives sheets
  // It may take some time to process depending on how many entries need to be updated

  await saveDomainCsvFile();
  await saveRepositoryListFile();
  await saveToolCsvFile();
  await saveOrganizationListFile();
  await saveRepositoryOrganizationListFile();

  await formatDomainsIntoDatabase();
  await formatRepositoriesIntoDatabase();
  await formatToolsIntoDatabase();
  await formatOrganizationsIntoDatabase();
  await formatRepositoryOrganizationsIntoDatabase();

  await enhanceDomainsIntoDatabase();
  await updateDomainsInventory();
  await enhanceRepositoriesIntoDatabase();
  await enhanceToolsIntoDatabase();

  await inferInitiativesFromDatabase();

  await ingestToolListToLlmSystem();
  await feedInitiativesFromDatabase();

  // Organizations are part of the initiative sheet, so they must be bound before ingesting initiatives into the LLM system
  await bindOrganizationsToInitiatives();

  // Only what is already stored, retrieving the reputation of domains is charged so it stays a manual action
  await updateInitiativesReputation();

  await ingestInitiativeListToLlmSystem();
}
