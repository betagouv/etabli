import { Command } from '@commander-js/extra-typings';

import { formatDomainsIntoDatabase, saveDomainCsvFile } from '@etabli/features/domain';

const program = new Command();

program.name('etabli').description('CLI to some deal with Établi project').version('0.0.0');

const domain = program.command('domain').description('manage domains');
const repository = program.command('repository').alias('repo').description('manage repositories');
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
  .command('prepare')
  .description('execute "fetch" and "format" sequentially')
  .action(async () => {
    console.log('domain.prepare');
  });

repository
  .command('fetch')
  .description('retrieve all public repositories')
  .action(async () => {
    console.log('repository.fetch');
  });

repository
  .command('format')
  .description('format repositories into the database for further analyses')
  .action(async () => {
    console.log('repository.format');
  });

repository
  .command('prepare')
  .description('execute "fetch" and "format" sequentially')
  .action(async () => {
    console.log('repository.prepare');
  });

initiative
  .command('infer')
  .description('create initiatives based on domains and repositories')
  .option('-d, --domain [domains...]', 'create initiative for this specific domain')
  .option('-r, --repository [repositories...]', 'create initiative for this specific repository')
  .action(async () => {
    console.log('initiative.infer');
  });

initiative
  .command('feed')
  .description('gather information from both domains and repositories to enhance all initiatives')
  .option('-d, --domain [domains...]', 'target this specific domain')
  .option('-r, --repository [repositories...]', 'target this specific repository')
  .option('-i, --interval', 'delay the next initiative feed')
  .option('-l, --limit', 'stop feeding after a number of initatives')
  .action(async () => {
    console.log('initiative.feed');
  });

initiative
  .command('search')
  .description('return initiatives that match the query')
  .argument('<query>', 'query to make the search')
  .action(async () => {
    console.log('initiative.search');
  });

cache
  .command('clear')
  .description('remove local files')
  .action(async () => {
    console.log('cache.clear');
  });

program.parse();