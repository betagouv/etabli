# [IMPORTANT] Must be built from the root of the project for the COPY/paths to work
# The `APP_HOST` variable defaults onto what Next.js server uses in a Docker environment

ARG NODE_VERSION=18.19.0
ARG RUBY_VERSION=1:3.1
ARG PIP_VERSION=23.0.1+dfsg-1
ARG PRISMA_VERSION=4.16.2
ARG APP_HOST=172.17.0.2
ARG PORT=3000

FROM node:${NODE_VERSION}-slim

ARG RUBY_VERSION
ARG PIP_VERSION
ARG PRISMA_VERSION
ARG APP_HOST
ARG PORT

USER root

# Install necessary dependencies
RUN apt-get update && apt-get install -y \
  "chromium" \
  "curl" \
  "git" \
  "pandoc" \
  "python3-pip=${PIP_VERSION}" \
  "python3-venv" \
  "ruby-dev=${RUBY_VERSION}" \
  && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN="/usr/bin/chromium"
ENV CHROME_PATH="/usr/lib/chromium/"

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${CHROME_BIN}"

# This one is required by Wappalyzer to launch the browser (ref: `node_modules/wappalyzer/driver.js`)
ENV CHROMIUM_BIN="${CHROME_BIN}"

# Restrict the permissions

RUN addgroup --system --gid 800 nodejs
RUN adduser --system --home /home/nextjs --uid 800 nextjs

USER nextjs

WORKDIR /app

# Copy manifest files

COPY --chown=nextjs:nodejs "src/bibliothecary/Gemfile" "src/bibliothecary/Gemfile.lock" ./
COPY --chown=nextjs:nodejs "src/semgrep/requirements.txt" ./

# Install tools
# Note: we did not specify the `bundler` version from the `Gemfile.lock` so it may adjust it accordingly
# We could have frozen it but it would require to fix the `bundle` version for local development too, which seems overkilled

# Docker does not allow injecting command result into an variable environment so doing it manually (ref: https://github.com/moby/moby/issues/29110)
# ENV GEM_HOME="$(ruby -e 'puts Gem.user_dir')"
ENV GEM_HOME="/home/nextjs/.local/share/gem/ruby/3.1.0"
ENV PATH="$GEM_HOME/bin:$PATH"

RUN gem install --user-install bundler
RUN bundle --gemfile Gemfile

RUN python3 -m venv ./venv \
  && . ./venv/bin/activate \
  && pip install -r requirements.txt

ENV PATH="/app/venv/bin:$PATH"

# Manage the final server build

COPY --chown=nextjs:nodejs ".next/standalone" ./
COPY --chown=nextjs:nodejs ".next/static" "./.next/static"
COPY --chown=nextjs:nodejs "public" "./public"
COPY --chown=nextjs:nodejs ".cache/models" "./data/models"

ENV PRISMA_VERSION $PRISMA_VERSION

ENV APP_HOST $APP_HOST
ENV PORT $PORT
EXPOSE $PORT

# We use `npx` to avoid using `npm run db:migration:deploy:unsecure` since we build as standalone the entire application and we no longer want to rely application `node_modules` folder
CMD npx --yes prisma@${PRISMA_VERSION} migrate deploy && ./start-and-wait-to-init.sh
