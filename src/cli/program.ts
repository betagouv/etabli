import { Command, Option } from '@commander-js/extra-typings';

import {
  enhanceDomainsIntoDatabase,
  formatDomainsIntoDatabase,
  matchDomains,
  saveDomainCsvFile,
  updateRobotsTxtOnDomains,
  updateWebsiteDataOnDomains,
  updateWildcardCertificateOnDomains,
} from '@etabli/src/features/domain';
import { feedInitiativesFromDatabase, inferInitiativesFromDatabase, runInitiativeAssistant } from '@etabli/src/features/initiative';
import { cleanLlmSystem, ingestInitiativeListToLlmSystem, ingestToolListToLlmSystem, initLlmSystem } from '@etabli/src/features/llm';
import {
  enhanceRepositoriesIntoDatabase,
  formatRepositoriesIntoDatabase,
  matchRepositories,
  saveRepositoryListFile,
  updateInferredMetadataOnRepositories,
} from '@etabli/src/features/repository';
import { enhanceToolsIntoDatabase, formatToolsIntoDatabase, saveToolCsvFile } from '@etabli/src/features/tool';
import { downloadPretrainedModels } from '@etabli/src/utils/cross-encoder';

export const program = new Command();

program.name('etabli').description('CLI to some deal with Établi project').version('0.0.0');

const domain = program.command('domain').description('manage domains');
const repository = program.command('repository').alias('repo').description('manage repositories');
const tool = program.command('tool').description('manage tools');
const llm = program.command('llm').description('manage llm settings and documents');
const model = program.command('model').description('manage pretrained models');
const initiative = program.command('initiative').description('manage initiatives');
const cache = program.command('cache').description('manage cache across commands');

domain
  .command('fetch')
  .description('retrieve the csv file listing almost all public domains')
  .action(async () => {
    await saveDomainCsvFile();
  });

domain
  .command('format')
  .description('format the local csv file into the database for further analyses')
  .action(async () => {
    await formatDomainsIntoDatabase();
  });

domain
  .command('enhance')
  .description('do extra work to bring domain information that needs a third-party')
  .addOption(
    new Option(
      '-t, --type <type...>',
      'type of metadata to enhance (locally you may need to use "npm run cli --- -t certificate" for example)'
    ).choices(['indexing', 'certificate', 'content', 'matching'] as const)
  )
  .action(async (options) => {
    if (!!options.type) {
      if (options.type.includes('indexing')) {
        await updateRobotsTxtOnDomains();
      }

      if (options.type.includes('certificate')) {
        await updateWildcardCertificateOnDomains();
      }

      if (options.type.includes('content')) {
        await updateWebsiteDataOnDomains();
      }

      if (options.type.includes('matching')) {
        await matchDomains();
      }
    } else {
      await enhanceDomainsIntoDatabase();
    }
  });

domain
  .command('prepare')
  .description('execute "fetch", "format" and "enhance" sequentially')
  .action(async () => {
    await saveDomainCsvFile();
    await formatDomainsIntoDatabase();
    await enhanceDomainsIntoDatabase();
  });

repository
  .command('fetch')
  .description('retrieve all public repositories')
  .action(async () => {
    await saveRepositoryListFile();
  });

repository
  .command('format')
  .description('format repositories into the database for further analyses')
  .action(async () => {
    await formatRepositoriesIntoDatabase();
  });

repository
  .command('enhance')
  .description('do extra work to bring repository information that needs a third-party')
  .addOption(
    new Option(
      '-t, --type <type...>',
      'type of metadata to enhance (locally you may need to use "npm run cli --- -t certificate" for example)'
    ).choices(['metadata', 'matching'] as const)
  )
  .action(async (options) => {
    if (!!options.type) {
      if (options.type.includes('metadata')) {
        await updateInferredMetadataOnRepositories();
      }

      if (options.type.includes('matching')) {
        await matchRepositories();
      }
    } else {
      await enhanceRepositoriesIntoDatabase();
    }
  });

repository
  .command('prepare')
  .description('execute "fetch", "format" and "enhance" sequentially')
  .action(async () => {
    await saveRepositoryListFile();
    await formatRepositoriesIntoDatabase();
    await enhanceRepositoriesIntoDatabase();
  });

tool
  .command('fetch')
  .description('retrieve list of possible initiative tools')
  .action(async () => {
    await saveToolCsvFile();
  });

tool
  .command('format')
  .description('format tools into the database for further matching')
  .action(async () => {
    await formatToolsIntoDatabase();
  });

tool
  .command('enhance')
  .description('do extra work to bring more tool metadata')
  .action(async () => {
    await enhanceToolsIntoDatabase();
  });

tool
  .command('prepare')
  .description('execute "fetch", "format" and "enhance" sequentially')
  .action(async () => {
    await saveToolCsvFile();
    await formatToolsIntoDatabase();
    await enhanceToolsIntoDatabase();
  });

model
  .command('download')
  .description('download pretrained models')
  .action(async () => {
    await downloadPretrainedModels();
  });

llm
  .command('initialize')
  .alias('init')
  .description('initialize llm assistants')
  .action(async () => {
    await initLlmSystem();
  });

llm
  .command('clean')
  .description('clean data of llm assistants')
  .action(async () => {
    await cleanLlmSystem();
  });

llm
  .command('initiatives')
  .command('ingest')
  .description('ingest initiative list as documents into the llm system')
  .action(async () => {
    await ingestInitiativeListToLlmSystem();
  });

llm
  .command('tools')
  .command('ingest')
  .description('ingest tool list as documents into the llm system')
  .action(async () => {
    await ingestToolListToLlmSystem();
  });

initiative
  .command('infer')
  .description('create initiatives based on domains and repositories')
  .option('-d, --domain [domains...]', 'create initiative for this specific domain')
  .option('-r, --repository [repositories...]', 'create initiative for this specific repository')
  .action(async (options) => {
    await inferInitiativesFromDatabase();
  });

initiative
  .command('feed')
  .description('gather information from both domains and repositories to enhance all initiatives')
  .option('-d, --domain [domains...]', 'target this specific domain')
  .option('-r, --repository [repositories...]', 'target this specific repository')
  .option('-i, --interval', 'delay the next initiative feed')
  .option('-l, --limit', 'stop feeding after a number of initatives')
  .action(async (options) => {
    await feedInitiativesFromDatabase();
  });

initiative
  .command('search')
  .description('return initiatives that match the query')
  .argument('<query>', 'query to make the search')
  .action(async (options) => {
    console.log('initiative.search');
  });

initiative
  .command('assistant')
  .description('run the initiative assistant in the terminal')
  .action(async (options) => {
    await runInitiativeAssistant();
  });

cache
  .command('clear')
  .description('remove local files')
  .action(async () => {
    console.log('cache.clear');
  });
