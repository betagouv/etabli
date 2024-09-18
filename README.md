# Établi

A french national platform allowing agents and citizens to search for public digital initiatives across a directory or by talking to an assistant. It improves visibility and so discoverability so people no longer miss what has been done.

- The project is available onto: https://etabli.incubateur.net _(#production)_

All the states of the application are described visually on a Storybook. It renders fake data but allows you to discover the project without dealing with real flows: https://main--65cba764ca6d6f49d5b40e50.chromatic.com/

## Datasets

We rely on 3 datasets to compute initiative sheets into Établi:

- [dinum/noms-de-domaine-organismes-secteur-public](https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public/) to retrieve public french domains
- [code.gouv.fr](https://code.gouv.fr/public/) to retrieve public french repositories
- [captn3m0/stackshare-dataset](https://github.com/captn3m0/stackshare-dataset) based on the [StackShare](https://stackshare.io/) data to build a fixed list of tools to bind initiatives to

_This is important to understand to detect new websites or new repositories they must be listed in the first two. Also, note we have no control over their acceptance process._

## Usage

This repository uses `make` CLI to ease the commands, have it installed and run:

```
make deps
```

Then you can have a look at the `Makefile` file to see common available commands.

For example to start developing and interact with the frontend, launch the application and the Storybook with:

```
make serve
```

If you want to only launch one of the two:

- Application: `npm run dev:app`
- Storybook: `npm run dev:storybook`

**Note the application needs some tools to run locally:**

- the database
- [Pandoc](https://pandoc.org/) (to format legal documents, can be installed through a manager like `brew`)
- [Semgrep](https://semgrep.dev/) (to analyze code files, can be installed through the Python package manager `pip` by running `pip install -r src/semgrep/requirements.txt`)
- [Bibliothecary](https://github.com/librariesio/bibliothecary) (to analyze code dependencies, can be installed through the Ruby package manager `bundle` by running `bundle --gemfile src/bibliothecary/Gemfile`)

Note for long-running tools the easiest way to use them is to use `docker-compose`. In another terminal just set up all tools:

```
docker-compose up
```

And when calling it a day you can stop those containers with:

```
docker-compose down
```

Now the database schema and client need to be initialized:
`npm run db:migration:deploy && npm run db:schema:compile`

Note since the application has a logic of jobs to be run regularly to fetch, analyze, and compute data. Those are not available in the UI, but you can trigger them through our custom CLI by running:
`npm run cli`

That's it! But still, we advise you to read the documentation below to better understand how the project is structured.

## Technical setup

### GitHub

#### Apps & Actions

- [CodeCov](https://github.com/marketplace/codecov): code coverage reports _(we have CodeQL in addition in the CI/CD... pick just one in the future)_
- [Lighthouse](https://github.com/apps/lighthouse-ci): accessibility reports _(we also have an accessibility plugin for Storybook, but this one only helps while developping)_

#### Environments

You must configure 1 environment in the CI/CD settings:

- `prod` (to restrict to `main` branch only)

#### Secrets

The following ones must be repository secrets (not environment ones):

- `CHROMATIC_PROJECT_TOKEN`: [SECRET]
- `CLEVER_APP_ID_PRODUCTION`: [GENERATED] _(format `app_{uuid}`, can be retrieved into the Clever Cloud interface)\_
- `CLEVER_TOKEN`: [GENERATED] _(can be retrieved from `clever login`, but be warned it gives wide access)_
- `CLEVER_SECRET`: [GENERATED] _(can be retrieved from `clever login`, but be warned it gives wide access)_
- `LHCI_GITHUB_APP_TOKEN`: [SECRET]
- `SENTRY_URL`: [SECRET] _(format `https://xxx.yyy.zzz/`)_
- `SENTRY_AUTH_TOKEN`: [SECRET]
- `SENTRY_ORG`: [SECRET]
- `SENTRY_PROJECT`: [SECRET]

**IMPORTANT: When building Next.js in a standalone mode the frontend `NEXT_PUBLIC_*` environement variables are hardcoded. It means you have to set all of them here too. This is a workaround but we have no simple other choice as of today. For more information have a look at the build step comment into `.github/workflows/ci.yml`.**

#### Default branch

The default branch is `main`.

#### Branch protection rules

1.  Pattern: `main`
    Checked:

    - Require status checks to pass before merging
    - Do not allow bypassing the above settings
    - Allow force pushes (+ "Specify who can force push" and leave for administrators) _(we allow this as the product is still experimental without a development environment)_

### Sentry

#### Helpful to monitor

We use Sentry to monitor errors that happen on frontend and backend. It has been added everywhere it was needed to catch unexpected errors no matter the tool used (Next.js, `pg-boss`...).

To keep safe sensitive information we prevent sensitive elements from being recorded by `rrweb` (useful to replay the session up to the issue).

_Note: `BusinessError` errors are not tracked because they are intented to describe a possible error in the user flow (validation error, entity deleted by someone and no longer existing...)_

Since Sentry gets only error details from the built application, we provide source maps during the CI/CD so debugging is easier by seeing original source code. For this we set `SENTRY_RELEASE_UPLOAD = true` into the `ci.yaml` file.

#### Upload sourcemaps

To upload sourcemaps to Sentry you need a specific "auth token", it must have these scopes:

- `project:releases`
- `org:read`

You can create this token at https://${SENTRY_URL}/settings/account/api/auth-tokens/ ;)

#### Silent odd errors

Since the application watches all kinds of errors, it happens we collect some that are not reproductible and without any impact for the user experience.

To avoid being notified of those we chose to silent them from the Sentry interface. Just go to your Sentry project interface, then `Processing > Inbound Filters > Custom Filters > Error Message` and enter the following silent patterns:

```
*ResizeObserver loop completed with undelivered notifications*
```

### Clever Cloud

#### Global

Create into the Clever Cloud Paris region both:

1. Docker application named `etabli` (at least a plan of 2 Go of memory)

- Enable into settings:
  - `Zero downtime deployment`
  - `Sticky sessions`` (will help with assistant session history since not in database)
  - `Enable dedicated build instance` with `XL` plan (otherwise the build is so slow even if only getting from another Docker image)
  - `Cancel ongoing deployment on new push`

2. PostgresSQL `v15` named `etabli` (at least a plan with 3 Go of storage)

- Enable the disk encryption at creation

#### Domains

You need to configure the domain DNS records to target the Clever Cloud instance when accessing the domain.

If a subdomain:

- Type: `CNAME`
- Hostname: `etabli`
- Value: `domain.par.clever-cloud.com.`

But if a root domain you have to use fixed IPs (reapeat this record X times if X IPs):

- Type: `A`
- Hostname: ``
- Value: `xxx.xxx.xxx.xxx` _(those can be found into the application domain names configuration)_

Once done, go to your Clever Cloud domains settings and add your domain.

#### Postgres

##### Tooling

We advise you to use [DBeaver](https://dbeaver.io/) (RDBMS-agnostic) to deal with your database.

#### Environment variables

Clever Cloud is used as a PaaS to host our builds.

For each build and runtime (since they are shared), you should have set some environment variables.

- `CC_DOCKERFILE`: [TO_DEFINE] _(should be `Dockerfile.prod.clevercloud` for the production environment and `Dockerfile.dev.clevercloud` for the development one. It's used during the build stage on the Clever Cloud side)_
- `CC_DOCKER_EXPOSED_HTTP_PORT`: `3000` _(it tells to Clever Cloud the port we are listening on)_
- `PORT`: `3000` _(since Clever Cloud has a default value for this variable we have to override it)_
- `NODE_OPTIONS`: `--max-old-space-size=1536` _(since we do some exports that fetch the whole database with post-processing, we expliticly tells Node.js our memory capacity (in this case we have 2 GB, but minus a few for Docker memory usage and minus the free memory to allocate))_
- `APP_MODE`: `prod` _(can be `dev` in case you would like to deploy a development environment)_
- `DATABASE_URL`: `$POSTGRESQL_ADDON_URI` _(you must copy/paste the value provided by Clever Cloud into `$POSTGRESQL_ADDON_URI`, and note you must add as query parameter `sslmode=prefer`)_
- `MAINTENANCE_API_KEY`: [SECRET] _(random string that can be generated with `openssl rand -base64 32`. Note this is needed to perform maintenance through dedicated API endpoints)_
- `MISTRAL_API_KEY`: [SECRET] _(you can create an API key from your MistralAI "La plateforme" account)_
- `LLM_MANAGER_MAXIMUM_API_REQUESTS_PER_SECOND`: [TO_DEFINE] _(by default the MistralAI platform has a limit of `5` request per second, but they may increase this limit on-demand. If so, you can increase the rate limit here to parallelize underlying requests)_
- `CHROMIUM_MAXIMUM_CONCURRENCY`: [TO_DEFINE] _(by default it will be `1` but it takes a long time when analyzing thousands of websites through the headless Chromium. After some testing we think on Clever Cloud having `4` is fine for the `S` plan (and `8` for `XL` plan for a quick test to speed things up), and locally it will depend on your hardware. Consider to lower the value when having more than 10% of analyses timed out)_
- `SEMGREP_PER_FILE_MEMORY_LIMIT_IN_MB`: [TO_DEFINE] _(semgrep will skip analyzing a specific file if it reaches this limit (and pass to the next one), we advise you to set it to 50% of the memory capacity of the server)_
- `NEXT_PUBLIC_APP_BASE_URL`: [TO_DEFINE] _(must be the root URL to access the application, format `https://xxx.yyy.zzz`)_
- `NEXT_PUBLIC_CRISP_WEBSITE_ID`: [TO_DEFINE] _(this ID is defined in your Crisp account and depends on the development or production environment)_
- `NEXT_PUBLIC_SENTRY_DSN`: [SECRET] _(format `https://xxx.yyy.zzz/nn`)_
- `NEXT_PUBLIC_MATOMO_URL`: [PROVIDED] _(format `https://xxx.yyy.zzz/`)_
- `NEXT_PUBLIC_MATOMO_SITE_ID`: [GENERATED] _(number format)_

**IMPORTANT: When building Next.js in a standalone mode the frontend `NEXT_PUBLIC_*` environement variables are hardcoded. It means you have to set them into the build environment too. For more information have a look at the build step comment into `.github/workflows/ci.yml`.**

_Note: `OPENAI_API_KEY` variable can be found in the code even if not used in production. It remains for comparing purposes, but also as a legacy since the proof of concept of Établi was based on GPT models._

#### Monitoring

It's important to be aware of some events, for this we decided to monitor:

- Clever Cloud (responsible for the application and database) seems to only alert by email
- Sentry (responsible for gathering runtime issues) can alert by email, webhooks (Slack format by default, but adapters can be used for Mattermost)

#### Debug the runtime

To debug Clever Cloud apps you can use their CLI to connect to instances:

```shell
clever ssh
```

Note that Clever Cloud databases are reachable by the public network directly... So no bridge to connect to it, but keep that in mind since it's more sensible than with some other providers.

To debug a remote database we advise creating a specific user (because you are not suppose to store credentials of production users). Make sure the user created has been granted needed roles on business tables, something like `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA $SCHEMA TO $USERNAME;` that you can customize as needed ;) . _(If you still see no table that's probably because you logged into the wrong database)_

#### Debug the CI/CD pipeline

This is not a silver bullet but for testing we use [act](https://github.com/nektos/act) locally to mimic what GitHub Actions would do. Install it and run:
`make simulate-cicd-with-push`

### Matomo

We use the minimal tracking configuration allowing the frontend to not request the user consent. Our goal is just to track pageviews, or usage of specific features of the application.

On the Matomo instance you have access to, just create a new website to get a new site ID.

### Crisp

Crisp is used as a livechat for user support.

From their interface we create a website with the production domain name while setting the name to `Établi`.

Then upload as the icon the one used for the website (usually `apple-touch-icon.png` has enough quality).

Add to the team the people you need (without giving too many rights depending on their role).

Into the `Chatbox & Email settings` section go to `Chat Appearance` and set:

- Color theme (chatbot color): `Red`
- Chatbox background (message texture): `Default (No background)`

Then go to `Chatbox Security` and enable `Lock the chatbox to website domain (and subdomains)` (no need to enable it inside the development environment).

Note the public "website ID" will be used as `NEXT_PUBLIC_CRISP_WEBSITE_ID`.

### Maintenance

Since everything stateful is inside the PostgreSQL you should be able to do most of the maintenance from `DBeaver`.

#### Retrieve old data from backups

Just download the database backup from the Clever Cloud interface and run it locally with Docker with no volume (to be sure not keeping sensitive data locally):

- Terminal 1:

```sh
docker run -it --rm -p 15432:5432 --name tmp_postgres -e POSTGRES_PASSWORD=postgres -v $(pwd)/${BACKUP_FILENAME}.pgsql:/backup.pgsql postgres
```

- Terminal 2:

```sh
docker exec -it tmp_postgres bash
pg_restore -U postgres -d postgres --no-owner -v /backup.pgsql
psql -U postgres -d postgres
```

_Note: sometimes `pg_restore` will fail creating the `public` schema despite having the command to. Create it manually through DBeaver within the database and rerun the `pg_restore` command to make it successful._

Then debug from SQL inline or use DBeaver to connect to `localhost:15432` with above credentials.

Once done, stop the container and remove the downloaded `.tar.gz / .psql` files.

#### Replay jobs

Except the case of replaying queueing jobs once they fail because they may be archived already. And since it's a bit tricky to move a job directly from SQL while cleaning its right properties, we decided to make an endpoint for this as an helper:

- [POST] `/api/maintenance/jobs/replay` _(it expects as body `{ jobId: "..." }`)_

**Note that to reach maintenance endpoints you have to pass a header `X-API-KEY` that must match the server environment variable `MAINTENANCE_API_KEY`.**

### IDE

Since the most used IDE as of today is Visual Studio Code we decided to go we it. Using it as well will make you benefit from all the settings we set for this project.

#### Manual steps

Every settings should work directly when opening the project with `vscode`, except for TypeScript.

Even if your project uses a TypeScript program located inside your `node_modules`, the IDE generally uses its own. Which may imply differences since it's not the same version. We do recommend using the exact same, for this it's simple:

1. Open a project TypeScript file
2. Open the IDE command input
3. Type `TypeScript` and click on the item `TypeScript: Select TypeScript Version...`
4. Then select `Use Workspace Version`

In addition, using the workspace TypeScript will load `compilerOptions.plugins` specified in your `tsconfig.json` files, which is not the case otherwise. Those plugins will bring more confort while developing!

### Tips

#### Cron tasks

Doing tasks on a regular basis is a real subject, ask yourself:

- Is it critical if a task schedule is missed? (ideally it could be trigger manually if the support team notices that, so keep track of it)
- Is it critical if multiple app instances run the same task concurrently?
- Does the job needs to be restarted if it fails?

... doing only in-app scheduling would break the persistence and concurrency challenges. On the other side, using a third-party to trigger our tasks is risky too since you rely on it and on the network. Even in the last case you should use a central locker to be sure you don't run 2 times the job in case of a close network retry.

The conclusion, in all cases we need something out of the app and that can manage atomicity for concurrency. So we chose to adopt `pg-boss` that allows us to use our own PostgreSQL like a basic tasks queue, it brings persistence, locking, and task monitoring with states (scheduled, canceled, failed, archived)... this is great because in 1 place we now finally have all things to debug, same in case of backups we do have the "task log".

#### Frontend development

##### i18n

Currently we only use i18n to help displaying ENUM values. We use the `i18n Ally` VSCode extension to improve a bit the usage but everything can be written manually in `.json` files :)

##### Storybook

###### Use it first

Developing a UI component by launching the whole application is annoying because you may have to do specific interactions to end viewing the right state of the component you are building.

We advise when doing some UI to only run Storybook locally, so you do not worry about other stuff. You can also mock your API calls! At the end splitting your component into different stories makes easy for non-technical people of the team to view deepest details. They will be able to review the visual changes with Chromatic, and also from the Storybook they will save too their time avoiding complex interactions to see specific state of the application.

It's not magical, it does not replace unit and end-to-end testing, but it helps :)

###### Advantages

- Accessibility reports
- See almost all tests of your application
- Helps architecturing your components split
- Their rendering is tested in the CI/CD, so it's very likely your components are valid at runtime

###### How we test stories

You can do UI testing scoped to components (I mean, not full end-to-end), and if so, it's recommended to reuse the stories to benefit from their mocking set up.

A decision we took to keep in mind: it's common to create a `.test.js` file to test that a component renders correctly (thanks to Jest, Playwright or Cypress), but since we have "Storybook test runners" already in place that pop each component, we feel it's better to use the story `play` function concept (also used by the interaction addon) to make sure they are rendering correctly.

- It avoids rendering each component one more time
- It saves 1 file and it's clearer since from Storybook you can see in the "Interactions" tab if the expected behavior is matched

Those kind of tests may be useful to:

- Make sure for an atomic component the data is displayed correctly (but it's likely the work of your team to review visual changes)
- Guarantee the sequences when mocking (e.g. first a loader, then the form is displayed), it helps also the "Storybook test runners" to wait the right moment to take a screenshot/snapshot of the final state (through Chromatic in this case), not intermediate ones since the runner doesn't know when the component is fully loaded otherwise

_(in case you have specific needs of testing that should not pollute the Storybook stories, go with a `.test.js` file, see examples [here](https://storybook.js.org/docs/react/writing-tests/importing-stories-in-tests))_

_Tip: during the testing you could `findByText` but it's recommended to `findByRole`. It helps thinking and building for accessibility from scratch (because no, accessibility is not done/advised by an accessibility automated check unfortunately)._

###### Testing performance

During the test we render the story, we test the light theme accessibility and then we switch to the dark theme to test it too. The re-rendering for color change over the entire DOM is unpredictable, it depends on the CPU saturation. We had some leakage of previous theme rendered over the new one.

We evaluated 2 solutions:

- limit the number of Jest workers with `--maxWorkers`
- increase the amount of time we wait after triggering a theme change

After dozens of tests it appears the most reliable and the fastest is by keeping parallelism (no worker limitation), but increase the amount of time. But this latter depends on the environment:

- when testing headless: there is less work done, the delay is shorter
- when testing with a browser rendering: it is in higher demand, to avoid color style leakage we need to increase the delay (tests duration is +50%, which is fine)

##### Hydratation issue

When developing a frontend it's likely you will have client hydratation according to the server content. It will fail if some browser extensions are enabled and modify the DOM. You need to identify the source of the issue and then, either disable the extension, or request it to not modify the DOM when developing on `http://localhost:xxxx/`.

From our experience, this can be caused by:

- Password managers _(make sure to have no credentials that match your development URL)_
- Cookie banner automatic rejection _(in their settings you're likely to be able to exclude your development URL from being analyzed)_

_(in React the error was `Extra attributes from the server: xxxxx`)_

##### Cannot fetch specific files

As for any `hydratation issue` it worths taking a look at your browser extensions, some may block outgoing requests.

For example:

- Ad blockers _(whitelist the blocked URL in your extension)_

#### Jest not working in VSCode

Sometimes it appears Jest VSCode extension will be stuck and will keep throwing:

```
env: node: No such file or directory
```

We found no fix. The only solution is to relaunch VSCode, and if it still doesn't work, try to close entirely VSCode and open it through your terminal with a something like:

```sh
code /Users/xxxxx/yyyyy/etabli
```

#### Formatting documents for compliance

Legal documents are mainly written out of technical scope in a basic text editor, and they may be updated quite often. Either you host them on a Markdown website or you embed them as HTML in your website. For both you have to maintain some transformations and you probably don't want to scan in detail for each modification, ideally you just want to redo all at once to be sure there will be no missing patch.

In this repository you can use `./format-legal-documents.sh` to transform the initial `.docx` files into `.html` files:

- No matter the name of the file it will convert it (though 1 per folder)
- It allows to collaborate on Word-like software (mainly used by legal people)

## Technical architecture document

It has been written into [TECHNICAL_ARCHITECTURE_DOCUMENT.md](./TECHNICAL_ARCHITECTURE_DOCUMENT.md).

## Reporting security issue

If you identify a security issue or have any security concerns, please inform us immediately by opening an [issue](https://github.com/betagouv/etabli/issues) as specified into [our security recommandations](https://www.mediateur-public.fr/.well-known/security.txt).
