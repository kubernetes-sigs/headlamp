#!/bin/sh -e

DESTDIR=$1

if [ -z "$DESTDIR" ]; then
  echo "Usage: $0 <destdir>"
  exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Fetch plugins
echo "Fetching plugins (wdir: $TMPDIR)..."

manifest=$(cat ./build-manifest.json)

plugins=$(echo $manifest | jq -r '.plugins[] | .name')
for plugin in $plugins; do
  echo "Fetching $plugin..."

  url=$(echo $manifest | jq -r ".plugins[] | select(.name == \"$plugin\") | .archive")
  sha256=$(echo "$manifest" | jq -r ".plugins[] | select(.name == \"$plugin\") | .sha256")
  curl -fsSL "$url" --output "$TMPDIR/$plugin.tgz"
  node "$(dirname "$0")/../plugins/pluginctl/src/archive-integrity.js" "$TMPDIR/$plugin.tgz" "$sha256"

  archivedir=$TMPDIR/$plugin
  mkdir -p $archivedir
  tar -xzf $TMPDIR/$plugin.tgz -C $archivedir --wildcards '*/main.js' '*/package.json' '*/locales/*/translation.json'

  ls -lr $archivedir

  extracted_dir=$(find $archivedir -mindepth 1 -maxdepth 1 -type d)

  dir=$DESTDIR/$plugin
  mkdir -p $dir
  cp $extracted_dir/main.js $extracted_dir/package.json $dir
  if [ -d "$extracted_dir/locales" ]; then
    cp -r $extracted_dir/locales $dir
  fi

  echo " done"
done

rm -rf $TMPDIR
