define HELP_TEXT

  Makefile commands

	make deps       - Install dependent programs and libraries
	make ...     	  - (see the Makefile)

endef

help:
	$(info $(HELP_TEXT))

build:
	npm run build
#--mode prod

build-dev:
	npm run build
#--mode dev

serve:
	npm run dev
#--mode test

serve-dev:
	npm run dev
#--mode dev

lint-prepare:
	npm run lint:prepare

lint:
	npm run lint

test-prepare:
	npm run test:prepare

test-unit:
	npm run test:unit

test-unit-watch:
	npm run test:unit:watch

test-e2e:
	npm run test:e2e:headless

clean:
	npm run clean

accessibility:
	npm run accessibility

accessibility-open:
	npm run accessibility:open

deps:
	npm install

tools-up:
	docker-compose up -d

tools-down:
	docker-compose down

format:
	npm run format

format-check:
	npm run format:check

simulate-cicd-with-push:
# Install `act` through a package manager to make it working
#
# Notes:
# - there is no way to specify the pipeline branch, you must locally change it
# - you can have weird issues like "unable to get git", try to set your local head to the remote one (with your changes uncommitted)
# - caching:
#   - for now the cache does not work and even if there is https://github.com/sp-ricard-valverde/github-act-cache-server it's a bit overheaded for a ponctual simulation
#   - using "--bind" is not ideal because `npm` will recreate the whole "node_modules" on the host, so we have to do `npm install` then (it would make sense for a computer dedicated to this)
#   - so we use "--reuse" that keeps using the existing docker container if any, to avoid downloading a new time each dependency. If you get weird behavior you can still remove the docker container from `act` and restart the command
# - we inject a meaningful commit SHA into "CC_COMMIT_ID" otherwise a Jest process will fail since we use it for Sentry stuff in the Next.js app
# - the default image is missing browsers stuff for e2e tests and `docker-compose`, we added 2 steps in the workflow to not deal with a custom image not officially supported (and the full official image is around 15GB... we don't want that either)
# - `.actrc` breaks `act` commands in specific situations, we avoid using it to factorize commands
	act push --reuse --env-file .github/act/.env --env CC_COMMIT_ID="$(git rev-parse @{upstream})" --eventpath .github/act/event.json
