import PgBoss from 'pg-boss';

import { enhanceDomainsIntoDatabase, formatDomainsIntoDatabase, saveDomainCsvFile } from '@etabli/src/features/domain';
import { feedInitiativesFromDatabase, inferInitiativesFromDatabase } from '@etabli/src/features/initiative';
import { ingestInitiativeListToLlmSystem, ingestToolListToLlmSystem } from '@etabli/src/features/llm';
import { enhanceRepositoriesIntoDatabase, formatRepositoriesIntoDatabase, saveRepositoryListFile } from '@etabli/src/features/repository';
import { enhanceToolsIntoDatabase, formatToolsIntoDatabase, saveToolCsvFile } from '@etabli/src/features/tool';

export const updateEntitiesDataTopic = 'update-entities-data';

export async function updateEntitiesData(job: PgBoss.Job<void>) {
  // The following will perform end-to-end update for any data needed to compute initiatives sheets
  // It may take some time to process depending on how many entries need to be updated

  await saveDomainCsvFile();
  await saveRepositoryListFile();
  await saveToolCsvFile();

  await formatDomainsIntoDatabase();
  await formatRepositoriesIntoDatabase();
  await formatToolsIntoDatabase();

  await enhanceDomainsIntoDatabase();
  await enhanceRepositoriesIntoDatabase();
  await enhanceToolsIntoDatabase();

  await inferInitiativesFromDatabase();

  await ingestToolListToLlmSystem();
  await feedInitiativesFromDatabase();
  await ingestInitiativeListToLlmSystem();
}
