#!/bin/sh -e

# Copyright 2025 The Kubernetes Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

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
