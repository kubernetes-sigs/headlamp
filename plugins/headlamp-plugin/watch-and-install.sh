#!/bin/sh

# Run once on start
echo "Installing plugins on startup..."
bin/headlamp-plugin.js install --config plugins.yaml --folderName plugins-dir

# Watch for changes
while inotifywait -e modify,create,delete /app/plugins.yaml; do
  echo "Config changed, re-installing plugins..."
  bin/headlamp-plugin.js install --config plugins.yaml --folderName plugins-tmp-dir
  rm -rf plugins-dir/*
  mv plugins-tmp-dir/* plugins-dir/
done
