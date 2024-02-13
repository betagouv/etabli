# Technical Architecture Document (TAD)

> The following just provides architectural information with a canvas common to all projects in our organization. It's not an installation guide nor a specification document.

**Project name:** Établi

**Code repository:** https://github.com/betagouv/etabli

**Application host (provider and _region_):**

- Production environment: Clever Cloud _(infra:clever-cloud)_

**Homologation outcome:** ❌

## Tracking

> The tracking of this document is made through the Git versioning.

## Contributors

> Below table details each contributor and their role in the writing of the TAD.

| Organization | Name        | Role      | Action  |
| ------------ | ----------- | --------- | ------- |
| Établi       | Thomas Ramé | Tech lead | Writing |

## Project description

A french national platform allowing agents and citizens to search for public digital initiatives across a directory or by talking to an assistant. It improves visibility and so discoverability so people no longer miss what has been done.

## Architecture

### Stack

_(When appropriate we describe the motivation of the choice)_

- Node.js
- TypeScript (used for both the frontend and the backend to mutualise utils and to simplify the stack)
- React (client-side)
- Responsive integration of the frontend
- RDBMS database (PostgreSQL to benefit from custom objects, to store files, and to manage the job queues)
- Next.js (framework to manage both the client and server)
- Prisma (database ORM to get typings dealing with requests)
- tRPC (used for client-server communication) (it's like GraphQL but "natively" using TypeScript schemas)
- npm (package manager)
- GitHub
- GitHub Actions (for the CI/CD)
- Clever Cloud (serverless provider, no Kubernetes or whatever)
- DSFR + MUI (UI frameworks)
- Storybook through Chromatic (helps collaborating with the non-technical team members and also bring more chance to have our components reused among the community) (also performs visual testing)
- Figma (to design any part of the project and collaborate)
- Jest (unit tests)
- axe-core (integrated within Storybook to perform accessibility testing)
- Docker (to deploy the application no matter the provider)
- Sentry (detection and reporting of errors)
- Crisp (for customer support but only loaded if the user explicitly triggers a button)
- La plateforme by Mistral AI (french actor to do artificial intelligence computation)

### Communication matrix

| Source   | Destination                    | Protocol | Port | Location                     | Type                                                     |
| -------- | ------------------------------ | -------- | ---- | ---------------------------- | -------------------------------------------------------- |
| Frontend | Backend                        | HTTPS    | 443  | Paris, France                | Internal                                                 |
| Frontend | Sentry                         | HTTPS    | 443  | Tours, France                | External (sentry.incubateur.net)                         |
| Frontend | Matomo                         | HTTPS    | 443  | Tours, France                | External (stats.beta.gouv.fr)                            |
| Frontend | Crisp                          | HTTPS    | 443  | France                       | External (client.crisp.chat and client.relay.crisp.chat) |
| Backend  | PostgreSQL                     | TCP      | -    | Paris, France                | Internal                                                 |
| Backend  | Sentry                         | HTTPS    | 443  | Paris, France                | External (sentry.incubateur.net)                         |
| Backend  | Matomo                         | HTTPS    | 443  | Tours, France                | External (stats.beta.gouv.fr)                            |
| Backend  | Mistral AI                     | HTTPS    | 443  | San Francisco, United States | External (api.mistral.ai)                                |
| Backend  | code.gouv.fr                   | HTTPS    | 443  | Paris, France                | External (code.gouv.fr)                                  |
| Backend  | GitLab by Adullact             | HTTPS    | 443  | Roubaix, France              | External (gitlab.adullact.net)                           |
| Backend  | GitHub                         | HTTPS    | 443  | San Francisco, United States | External (raw.githubusercontent.com)                     |
| Backend  | \* _(websites to inspect)_     | HTTPS    | 443  | \*                           | External (\*)                                            |
| Backend  | \* _(repositories to inspect)_ | HTTPS    | 443  | \*                           | External (\*)                                            |

**Note we list all flows known in advance except the two last wildcard entries. This is because Établi does gather data like website content and repository files from dynamic inputs. We cannot list them all since there are dynamic, but those endpoints are just for read-only purposes and no user data is sent to their servers.**

<!-- We used https://www.site24x7.com/tools/find-website-location.html to find locations -->

### Dependencies

| Target      | Dependency | Version  | Comment                                                                                       |
| ----------- | ---------- | -------- | --------------------------------------------------------------------------------------------- |
| Application | Librairies | -        | Listed in `/package.json` (the entire dependency tree is available into `/package-lock.json`) |
| Application | PostgreSQL | `v15.4+` | The version can differ due to provider upgrades                                               |

### Services diagram

![Services diagram](services_diagram.drawio.svg 'Services diagram')

### Database structure diagram

We do not commit the database structure directly since some initialization can be done by our librairies (ORM, queueing system...).

To get a meaningful overview we advise you to:

1. Follow usage instructions within the `README.md` to launch the application locally
2. Download and launch the database tool `DBeaver` that is open source
3. Configure it by using connection information from the `/.env.test`
4. In the menu, under your connection open `Databases > xxxx > Schemas`
5. On each schema (`public` and `pgboss` currently), right click and select `View diagram`

Those are interactive entity relationship diagrams representing the entire database.

## Requirements

**The following is about the production environment. We would not expand on a development environment because it would store fake data, and would give a bit more priviliges to developers to test and debug, but still, it would totally be isolated from the production.**

### Server access and communication security

Since the provider Clever Cloud does not allow assigning specific roles to collaborators, it means someone having the access has full access.

All team members are required to use the 2FA in Clever Cloud and to use a secure password manager to generate credentials not guessable.

### Application authentication and access control

The application has for now no authentication system since only displaying public information.

### Activity tracking

- Errors are forwarded to Sentry so we can debug and manage alerts
- Our logs give an overview of what is happening

In both cases no sensitive information is provided.

### Application update policy

We chose to not use an automated tool to upgrade our dependencies because:

- Most of the time new versions are not about security, so automation is likely to bring breaking changes in our own application since it's known a few respects the `semver` naming when publishing a new version
- When it's about a security reason, it's in majority targeting a deep nested dependency and the indirect usage we have of it is far from the vulnerability

Instead we rely on CVE notifications from GitHub and we decide if it is a trigger. And we also keep looking at notifications from our organization since a lot of projects share the same stack.

### Integrity

Clever Cloud enables automatic backups with its own security guards.

We plan in the future to duplicate those backups onto another provider in a different location to be sure having our Clever Cloud access compromised would not be a dead-end.

### Privacy

Please refer to our privacy policy to know more about this.
