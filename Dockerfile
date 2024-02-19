# [IMPORTANT] Must be built from the root of the project for the COPY/paths to work

ARG NODE_VERSION=18.19.0
ARG RUBY_VERSION=3.2.2-r1
ARG PIP_VERSION=23.3.1-r0
ARG PORT=3000

FROM node:${NODE_VERSION}-alpine

RUN apk add --no-cache 'ruby=${RUBY_VERSION}' 'py3-pip=${PIP_VERSION}'
RUN apk update

# Copy manifest files

COPY "src/bibliothecary/Gemfile" "src/bibliothecary/Gemfile.lock" ./
COPY "src/semgrep/requirements.txt" ./

# Install tools

RUN gem install bundler
RUN bundle --gemfile Gemfile

RUN pip install -r requirements.txt

# Manage the final server build

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

USER nextjs

COPY --chown=nextjs:nodejs ".next/standalone" ./
COPY --chown=nextjs:nodejs ".next/static" "./.next/static"
COPY --chown=nextjs:nodejs "public" "./public"
COPY --chown=nextjs:nodejs "start-and-wait-to-init.sh" ./

ENV PORT $PORT
EXPOSE $PORT

# We use `npx` to avoid using `npm run db:migration:deploy:unsecure` since we build as standalone the entire application and we no longer want to rely application `node_modules` folder
CMD npx prisma migrate deploy && start-and-wait-to-init.sh
