# Établi

This is a work in progress, so you won't find meaningful information here.

## Setup

Binaries:

- pandoc
- semgrep
- wappalyzer local alternative?

Since we are using a custom Postgres Docker image to have `pgvector` extension installed, use:
`docker-compose up`

And since no migration files yet due to being under development, please use the raw SQL:
`CREATE EXTENSION IF NOT EXISTS vector;`

Then you can init the database:
`npm run db:push && npm run db:schema:compile`

Finally, you can find available commands with:
`npm run cli`

## Datasets

We are using 3 datasets to compute initiative sheets:

- [dinum/noms-de-domaine-organismes-secteur-public](https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public/) to retrieve public french domains
- [code.gouv.fr](https://code.gouv.fr/public/) to retrieve public french repositories
- [captn3m0/stackshare-dataset](https://github.com/captn3m0/stackshare-dataset) based on the [StackShare](https://stackshare.io/) data to build a fixed list of tools to bind initiatives to
