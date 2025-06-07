#!/bin/sh
# This install dependencies for the plugin folder
set -e
set -o xtrace

for i in * ; do
  if [ -d "$i" ]; then
    cd "$i"
    npm ci
    cd ..
  fi
done
