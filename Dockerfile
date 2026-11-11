# [IMPORTANT] Must be built from the root of the project for the COPY/paths to work
# The `APP_HOST` variable defaults onto what Next.js server uses in a Docker environment

ARG NODE_VERSION=22.23.4
ARG RUBY_VERSION=1:3.3+b1
ARG PIP_VERSION=25.1.1+dfsg-1
ARG PRISMA_VERSION=7.10.1
ARG APP_HOST=172.17.0.2
ARG PORT=3000

#
# Tools stage: everything needing compilers, development headers or package managers is installed here
# and only its result is copied into the final image
#

FROM node:${NODE_VERSION}-trixie-slim AS tools

ARG RUBY_VERSION
ARG PIP_VERSION
ARG PRISMA_VERSION

RUN apt-get update && apt-get install -y \
  "python3-pip=${PIP_VERSION}" \
  "python3-venv" \
  "ruby-dev=${RUBY_VERSION}" \
  && rm -rf /var/lib/apt/lists/*

# Prisma is only used to run `prisma migrate deploy` at start (the standalone application has no `node_modules` with it)
RUN npm install --prefix /opt/prisma "prisma@${PRISMA_VERSION}"

RUN addgroup --system --gid 800 nodejs
RUN adduser --system --home /home/nextjs --uid 800 nextjs

USER nextjs

WORKDIR /app

COPY --chown=nextjs:nodejs "src/bibliothecary/Gemfile" "src/bibliothecary/Gemfile.lock" ./
COPY --chown=nextjs:nodejs "src/semgrep/requirements.txt" ./

# Note: we did not specify the `bundler` version from the `Gemfile.lock` so it may adjust it accordingly
# We could have frozen it but it would require to fix the `bundle` version for local development too, which seems overkilled
# Docker does not allow injecting command result into an variable environment so doing it manually (ref: https://github.com/moby/moby/issues/29110)
# ENV GEM_HOME="$(ruby -e 'puts Gem.user_dir')"
ENV GEM_HOME="/home/nextjs/.local/share/gem/ruby/3.3.0"
ENV PATH="$GEM_HOME/bin:$PATH"

RUN gem install --user-install bundler
RUN bundle --gemfile Gemfile

# The virtual environment references its interpreter by path, so it is created where it is used in the final image
RUN python3 -m venv ./venv \
  && . ./venv/bin/activate \
  && pip install -r requirements.txt

#
# Final image: only what is needed at runtime (no compiler, no development headers, no package manager)
#

FROM node:${NODE_VERSION}-trixie-slim

ARG PRISMA_VERSION
ARG APP_HOST
ARG PORT

USER root

# Runtime tools of the data update (websites content and tools, code analysis) and of the startup script
RUN apt-get update && apt-get install -y \
  "chromium" \
  "curl" \
  "dumb-init" \
  "git" \
  "pandoc" \
  "python3" \
  "ruby" \
  "xvfb" \
  && rm -rf /var/lib/apt/lists/* \
  # npm is not used at runtime, removing it removes the vulnerabilities of its own dependencies from the image
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

ENV CHROME_BIN="/usr/bin/chromium"
ENV CHROME_PATH="/usr/lib/chromium/"

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${CHROME_BIN}"

# This one is required by Wappalyzer to launch the browser (ref: `node_modules/wappalyzer/driver.js`)
ENV CHROMIUM_BIN="${CHROME_BIN}"

COPY --from=tools /opt/prisma /opt/prisma

# `prisma` is called by the startup command, and `prisma.config.ts` imports `prisma/config`
ENV PATH="/opt/prisma/node_modules/.bin:$PATH"
ENV NODE_PATH="/opt/prisma/node_modules"

# Restrict the permissions

RUN addgroup --system --gid 800 nodejs
RUN adduser --system --home /home/nextjs --uid 800 nextjs

USER nextjs

WORKDIR /app

ENV GEM_HOME="/home/nextjs/.local/share/gem/ruby/3.3.0"
ENV PATH="/app/venv/bin:$GEM_HOME/bin:$PATH"

COPY --from=tools --chown=nextjs:nodejs "/home/nextjs/.local/share/gem" "/home/nextjs/.local/share/gem"
COPY --from=tools --chown=nextjs:nodejs "/app/Gemfile" "/app/Gemfile.lock" ./
COPY --from=tools --chown=nextjs:nodejs "/app/venv" ./venv

# Manage the final server build

COPY --chown=nextjs:nodejs ".next/standalone" ./
# esbuild is traced by Next.js but never used at runtime, its old binary embeds a vulnerable Go standard library
RUN rm -rf ./node_modules/esbuild ./node_modules/@esbuild
COPY --chown=nextjs:nodejs ".next/static" "./.next/static"
COPY --chown=nextjs:nodejs "public" "./public"
COPY --chown=nextjs:nodejs ".cache/models" "./data/models"

ENV PRISMA_VERSION=$PRISMA_VERSION

ENV APP_HOST=$APP_HOST
ENV PORT=$PORT
EXPOSE $PORT

# Needed to handle signals properly (due to PID 1)
ENTRYPOINT ["dumb-init", "--"]

CMD ["bash", "-c", "prisma migrate deploy && exec ./start-and-wait-to-init.sh"]
