#!/bin/sh
# A humble test of the plugins/examples

set -e
set -o xtrace

npm run check-dependencies
npm run build
npm run copy-package-lock
npm pack

cd ../examples
for i in * ; do
  if [ -d "$i" ]; then
    cd "$i"
    # First, do a fast clean install of all dependencies from the lockfile.
    npm ci
    # Then override headlamp-plugin with the locally built tarball so we test
    # PR/repo changes that the released registry version might not have.
    # npm ci cannot do this — it ignores positional package arguments and would
    # silently keep the registry version.
    npm install `ls -t ../../headlamp-plugin/kinvolk-headlamp-plugin-*.tgz | head -1`
    npm run lint
    npm run format
    npm run build
    npm run tsc
    cd ..
  fi
done

