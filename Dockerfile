# [IMPORTANT] Must be built from the root of the project for the COPY/paths to work
# The `APP_HOST` variable defaults onto what Next.js server uses in a Docker environment

ARG NODE_VERSION=18.19.0
ARG RUBY_VERSION=3.2.2-r1
ARG PIP_VERSION=23.3.1-r0
ARG PRISMA_VERSION=4.16.2
ARG APP_HOST=172.17.0.2
ARG PORT=3000

# Note: the pandoc package version naming is completely different than the official repository so as of now
# we are not specifying a fixed version (ref: https://pkgs.alpinelinux.org/package/edge/community/x86_64/pandoc-cli)

FROM node:${NODE_VERSION}-alpine

ARG RUBY_VERSION
ARG PIP_VERSION
ARG PRISMA_VERSION
ARG APP_HOST
ARG PORT

USER root

RUN apk add \
  # This is for the code we manage
  "build-base" \
  "libffi-dev" \
  "libcurl" \
  "curl" \
  "git" \
  "pandoc-cli" \
  "ruby-dev=${RUBY_VERSION}" \
  "py3-pip=${PIP_VERSION}" \
  # This is the dependencies needed by chromium
  "chromium" \
  "libstdc++" \
  "harfbuzz" \
  "nss" \
  "freetype" \
  "ttf-freefont" \
  "font-noto-emoji" \
  "wqy-zenhei"

ENV CHROME_BIN="/usr/bin/chromium-browser"
ENV CHROME_PATH="/usr/lib/chromium/"

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${CHROME_BIN}"

# This one is required by Wappalyzer to launch the browser (ref: `node_modules/wappalyzer/driver.js`)
ENV CHROMIUM_BIN="${CHROME_BIN}"

# Restrict the permissions

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

USER nextjs

WORKDIR /app

# Copy manifest files

COPY --chown=nextjs:nodejs "src/bibliothecary/Gemfile" "src/bibliothecary/Gemfile.lock" ./
COPY --chown=nextjs:nodejs "src/semgrep/requirements.txt" ./

# Install tools
# Note: we did not specify the `bundler` version from the `Gemfile.lock` so it may adjust it accordingly
# We could have frozen it but it would require to fix the `bundle` version for local development too, which seems overkilled

RUN gem install --user-install bundler

# Docker does not allow injecting command result into an variable environment so doing it manually (ref: https://github.com/moby/moby/issues/29110)
# ENV GEM_HOME="$(ruby -e 'puts Gem.user_dir')"
ENV GEM_HOME="/home/nextjs/.local/share/gem/ruby/3.2.0"
ENV PATH="$GEM_HOME/bin:$PATH"

RUN bundle --gemfile Gemfile

RUN python3 -m venv ./venv \
  && source ./venv/bin/activate \
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
