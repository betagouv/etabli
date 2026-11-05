import { Command, Option } from '@commander-js/extra-typings';

import {
  enhanceDomainsIntoDatabase,
  formatDomainsIntoDatabase,
  matchDomains,
  saveDomainCsvFile,
  slimStoredWebsitesContent,
  updateProtectedWebsiteDataOnDomains,
  updateRobotsTxtOnDomains,
  updateWebsiteDataOnDomains,
  updateWildcardCertificateOnDomains,
} from '@etabli/src/features/domain';
import { retryBlockedDomains } from '@etabli/src/features/domain-blocked';
import { flagDomainsForHttpSecurityUpdate, updateDomainsHttpSecurity } from '@etabli/src/features/domain-http-security';
import { printDomainsUsingTechnology, updateDomainsInventory } from '@etabli/src/features/domain-inventory';
import { updateDomainsMailSecurity } from '@etabli/src/features/domain-mail-security';
import {
  defaultMaximumCost,
  flagDomainsForReputationUpdate,
  updateDomainsReputation,
  updateInitiativesReputation,
} from '@etabli/src/features/domain-reputation';
import { reclassifyDomainsSovereignty, updateDomainsSovereignty } from '@etabli/src/features/domain-sovereignty';
import { feedInitiativesFromDatabase, inferInitiativesFromDatabase, runInitiativeAssistant } from '@etabli/src/features/initiative';
import { updateDomainsLegalLinks, updateInitiativesIndicators } from '@etabli/src/features/initiative-indicators';
import { cleanLlmSystem, ingestInitiativeListToLlmSystem, ingestToolListToLlmSystem, initLlmSystem } from '@etabli/src/features/llm';
import { bindOrganizationsToInitiatives, formatOrganizationsIntoDatabase, saveOrganizationListFile } from '@etabli/src/features/organization';
import {
  enhanceRepositoriesIntoDatabase,
  formatRepositoriesIntoDatabase,
  matchRepositories,
  saveRepositoryListFile,
  updateInferredMetadataOnRepositories,
} from '@etabli/src/features/repository';
import { formatRepositoryOrganizationsIntoDatabase, saveRepositoryOrganizationListFile } from '@etabli/src/features/repository-organization';
import { enhanceToolsIntoDatabase, formatToolsIntoDatabase, saveToolCsvFile } from '@etabli/src/features/tool';
import { downloadPretrainedModels } from '@etabli/src/utils/cross-encoder';

export const program = new Command();

program.name('etabli').description('CLI to some deal with Établi project').version('0.0.0');

const domain = program.command('domain').description('manage domains');
const repository = program.command('repository').alias('repo').description('manage repositories');
const organization = program
  .command('organization')
  .alias('orga')
  .description('manage public organizations (DILA directory) and their forge accounts');
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
    ).choices(['indexing', 'certificate', 'content', 'protected', 'matching'] as const)
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

      if (options.type.includes('protected')) {
        await updateProtectedWebsiteDataOnDomains();
      }

      if (options.type.includes('matching')) {
        await matchDomains();
      }
    } else {
      await enhanceDomainsIntoDatabase();
    }
  });

domain
  .command('inventory')
  .description('detect technologies running on domains, including those not listed as initiatives (internal use)')
  .option('-l, --limit <number>', 'maximum of domains to analyze', parseInt)
  .option('--only-missing', 'only analyze the domains of initiatives that have no sheet yet')
  .action(async (options) => {
    await updateDomainsInventory({ maximumDomains: options.limit, onlyMissingInitiatives: !!options.onlyMissing });
  });

domain
  .command('reputation')
  .description('retrieve the reputation of flagged domains (this is charged by the provider, so it is never run automatically)')
  .option('-l, --limit <number>', 'maximum number of domains to process')
  .option('-c, --maximum-cost <dollars>', 'stop before exceeding this amount', `${defaultMaximumCost}`)
  .option('--domains-per-request <number>', 'maximum number of different domains per request')
  .option('--dry-run', 'only display what would be done and its estimated cost')
  .action(async (options) => {
    await updateDomainsReputation({
      maximumDomains: options.limit ? parseInt(options.limit, 10) : undefined,
      maximumCost: parseFloat(options.maximumCost),
      maximumDifferentDomains: options.domainsPerRequest ? parseInt(options.domainsPerRequest, 10) : undefined,
      dryRun: !!options.dryRun,
    });
  });

domain
  .command('reputation-flag')
  .description('flag domains so the next `domain reputation` retrieves them again (all of them if none is specified)')
  .argument('[domains...]', 'domains to flag')
  .action(async (domains: string[]) => {
    console.log(`${await flagDomainsForReputationUpdate(domains.length > 0 ? domains : undefined)} domains flagged`);
  });

domain
  .command('reputation-apply')
  .description('recompute the reputation of initiatives from the stored one of their domains (it costs nothing)')
  .action(async () => {
    console.log(`${await updateInitiativesReputation()} initiatives updated`);
  });

domain
  .command('http-security')
  .description('retrieve the grade of the HTTP security headers of flagged domains from Mozilla HTTP Observatory (internal use)')
  .option('-l, --limit <number>', 'maximum number of domains to process')
  .option('--concurrency <number>', 'number of simultaneous scans')
  .action(async (options) => {
    await updateDomainsHttpSecurity({
      maximumDomains: options.limit ? parseInt(options.limit, 10) : undefined,
      concurrency: options.concurrency ? parseInt(options.concurrency, 10) : undefined,
    });
  });

domain
  .command('http-security-flag')
  .description('flag domains so the next `domain http-security` scans them again (all of them if none is specified)')
  .argument('[domains...]', 'domains to flag')
  .action(async (domains: string[]) => {
    console.log(`${await flagDomainsForHttpSecurityUpdate(domains.length > 0 ? domains : undefined)} domains flagged`);
  });

domain
  .command('mail-security')
  .description('look at MX, SPF and DMARC of root domains from public DNS records (no request is sent to websites)')
  .option('-l, --limit <number>', 'maximum number of domains to process')
  .action(async (options) => {
    await updateDomainsMailSecurity({ maximumDomains: options.limit ? parseInt(options.limit, 10) : undefined });
  });

domain
  .command('sovereignty')
  .description('detect foreign dependencies from DNS records and stored home pages (no request is sent to websites)')
  .option('-l, --limit <number>', 'maximum number of domains to process')
  .action(async (options) => {
    await updateDomainsSovereignty({ maximumDomains: options.limit ? parseInt(options.limit, 10) : undefined });
  });

domain
  .command('sovereignty-apply')
  .description('recompute foreign dependencies from what is stored, after changing the classification (no DNS query)')
  .action(async () => {
    console.log(`${await reclassifyDomainsSovereignty()} domains processed`);
  });

domain
  .command('retry-blocked')
  .description(
    'process again only the websites refusing where requests come from (content then tools), meant to be run from another network than the usual one'
  )
  .option('--dry-run', 'only display how many websites would be processed')
  .action(async (options) => {
    await retryBlockedDomains({ dryRun: !!options.dryRun });
  });

domain
  .command('slim-content')
  .description('remove inline scripts, styles, drawings and embedded files from home pages already stored (no request is sent to websites)')
  .action(async () => {
    const { processedPages, slimmedPages, savedCharacters } = await slimStoredWebsitesContent();

    console.log(`${slimmedPages}/${processedPages} pages slimmed, ${Math.round(savedCharacters / 1_000_000)} million characters saved`);
  });

domain
  .command('legal-links')
  .description('detect the legal notice and privacy policy links on home pages already stored (no request is sent to websites)')
  .action(async () => {
    console.log(`${await updateDomainsLegalLinks()} domains processed`);
  });

domain
  .command('indicators-apply')
  .description('recompute the security and legal indicators of initiatives from the stored ones of their domains')
  .action(async () => {
    console.log(`${await updateInitiativesIndicators()} initiatives updated`);
  });

domain
  .command('technology')
  .description('list domains running a technology, to contact them in case of a vulnerability (internal use)')
  .argument('<name>', 'name of the technology (e.g. Metabase)')
  .action(async (name) => {
    await printDomainsUsingTechnology(name);
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

organization
  .command('fetch')
  .description('retrieve the DILA directory of public organizations and the code.gouv.fr list of their forge accounts')
  .option('--no-cache', 'download the files even if already present locally')
  .action(async (options) => {
    await saveOrganizationListFile(options.cache);
    await saveRepositoryOrganizationListFile(options.cache);
  });

organization
  .command('format')
  .description('format organizations and their forge accounts into the database')
  .action(async () => {
    await formatOrganizationsIntoDatabase();
    await formatRepositoryOrganizationsIntoDatabase();
  });

organization
  .command('bind')
  .description('bind initiatives to organizations according to their websites and repositories')
  .action(async () => {
    await bindOrganizationsToInitiatives();
  });

organization
  .command('prepare')
  .description('execute "fetch", "format" and "bind" sequentially')
  .action(async () => {
    await saveOrganizationListFile();
    await saveRepositoryOrganizationListFile();
    await formatOrganizationsIntoDatabase();
    await formatRepositoryOrganizationsIntoDatabase();
    await bindOrganizationsToInitiatives();
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
  .option('--only-missing', 'only compute the initiatives that have no sheet yet')
  .option('--only-websites', 'only compute the initiatives having at least a website')
  .action(async (options) => {
    await feedInitiativesFromDatabase({ onlyMissing: !!options.onlyMissing, onlyWebsites: !!options.onlyWebsites });
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
