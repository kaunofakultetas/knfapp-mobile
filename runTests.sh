#!/bin/bash
############################################################
#  [*] Run the mobile app's jest suites
#
#  jest in a throwaway --rm container of the compose-built
#  knfapp-mobile image, the app tree mounted READ-ONLY —
#  the running Metro container (and the phone hot-reloading
#  from it) is never touched and nothing survives the run.
#  The jest cache goes to a tmpfs because the mount is
#  read-only; node_modules comes from the bind-mounted tree
#  (the dev container's npm install put it there; a fresh
#  checkout runs `npm install` in app/ once first). No
#  network: the one suite that needs the live assistant
#  (services/__tests__/assistantWire.integration.test.ts)
#  skips itself unless ASSISTANT_WIRE_URL is set — that is
#  `npm run test:integration` inside the dev container.
#
#  Arguments pass through to jest: a path filters suites.
#  Coverage wants a writable tree, so that is
#  `npm run test:coverage` inside the dev container too.
############################################################

set -e
cd "$(dirname "$0")"

sudo docker run --rm --network none \
    -v "$PWD/app:/app:ro" \
    --tmpfs /tmp \
    knfapp-mobile \
    sh -c "cd /app && npx jest --cacheDirectory=/tmp/jest $*"
