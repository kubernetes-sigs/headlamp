#!/bin/sh -e

DESTDIR=$1

if [ -z "$DESTDIR" ]; then
  echo "Usage: $0 <destdir>"
  exit 1
fi

TMPDIR=$(mktemp -d)

# Fetch plugins
echo "Fetching plugins (wdir: $TMPDIR)..."

manifest=$(cat ./build-manifest.json)

plugins=$(echo $manifest | jq -r '.plugins[] | .name')
for plugin in $plugins; do
  echo "Fetching $plugin..."

  url=$(echo $manifest | jq -r ".plugins[] | select(.name == \"$plugin\") | .archive")
  curl -sL $url --output-dir $TMPDIR --output $plugin.tgz

  archivedir=$TMPDIR/$plugin
  mkdir -p $archivedir
  tar -xzf $TMPDIR/$plugin.tgz -C $archivedir --wildcards '*/main.js' '*/package.json'

  ls -lr $archivedir

  extracted_dir=$(find $archivedir -mindepth 1 -maxdepth 1 -type d)

  dir=$DESTDIR/$plugin
  mkdir -p $dir
  cp $extracted_dir/main.js $extracted_dir/package.json $dir

  echo " done"
done

rm -rf $TMPDIR
