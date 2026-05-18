#!/bin/sh
# A humble test of the plugins/examples

set -e
set -o xtrace

npm run check-dependencies
npm run build
npm pack

cd ../examples
for i in * ; do
  if [ -d "$i" ]; then
    cd "$i"
    # Test changes to headlamp-plugin in the PR/repo that released version might not have.
    npm ci `ls -t ../../headlamp-plugin/kinvolk-headlamp-plugin-*.tgz | head -1`
    npm run lint
    npm run format
    npm run build
    npm run tsc
    cd ..
  fi
done

