/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// This script copies the translations from a translations file to an existing file.
// By default, it 1) only overwrites translations that are missing or are empty, in the destination file,
// and 2) only copies translations that are in the destination file.
// You can use the --force option to overwrite translations that are not empty in the destination file.
// You can use the --all option to copy all translations, even if they are not in the destination file.

const fs = require('fs');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .command('$0 <srcFile> <destFile>', 'Process a translations file', yargs => {
    yargs.positional('srcFile', {
      describe: 'Path to the translations file to copy translations from',
      demandOption: true,
      type: 'string',
    });
    yargs.positional('destFile', {
      describe: 'Path to the translations file to copy translations into',
      demandOption: true,
      type: 'string',
    });
  })
  .option('force', {
    alias: 'f',
    type: 'boolean',
    default: false,
    describe: 'Force overwrite non-empty values',
  })
  .option('all', {
    alias: 'a',
    type: 'boolean',
    default: false,
    describe: 'Copy all translations, even if they are not in the destination file',
  })
  .version(false).argv;

const src = fs.readFileSync(argv.srcFile, 'utf8');
const dest = fs.readFileSync(argv.destFile, 'utf8');

const srcData = JSON.parse(src);
const destData = JSON.parse(dest);
const copyAll = argv.all;
let isChanged = false;

for (const key in srcData) {
  if (
    (!!srcData[key] || copyAll) &&
    (destData.hasOwnProperty(key) || argv.all) &&
    (!destData[key] || argv.force)
  ) {
    isChanged = true;
    destData[key] = srcData[key];
  }
}

if (!isChanged) {
  console.log('No translations copied.');
  process.exit(0);
}

// Write the updated destData back to the file
fs.writeFileSync(argv.destFile, JSON.stringify(destData, null, 2));
