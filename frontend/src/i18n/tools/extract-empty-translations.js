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

// ⚠️ DEPRECATED: This script is deprecated. Use the new i18n tool instead:
//   npm run i18n:extract -- <translationsFile> [outputFile]
//
// This script copies the empty translations from a translations file to a new file. So they can
// be easily spotted and translated.
//
// Usage: node extract-empty-translations.js <translationsFile> [-o <outputFile>]
// Example (creates a ./src/i18n/locales/de/translations_empty.json file):
//   node extract-empty-translations.js ./src/i18n/locales/de/translations.json

const fs = require('fs');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .command('$0 <translationsFile>', 'Process a translations file', yargs => {
    yargs.positional('translationsFile', {
      describe: 'Path to the translations file',
      type: 'string',
    });
  })
  .option('outputFile', {
    alias: 'o',
    type: 'string',
    describe: 'Path to the output file',
  })
  .version(false).argv;

const translations = fs.readFileSync(argv.translationsFile, 'utf8');
const translationsData = JSON.parse(translations);

// Extract the keys with empty values
const emptyKeys = Object.keys(translationsData).filter(key => translationsData[key] === '');

// Create an object with the empty keys and empty values
const emptyTranslationsData = emptyKeys.reduce((obj, key) => {
  obj[key] = '';
  return obj;
}, {});

// If an output file is specified, write the data to the file
if (Object.keys(emptyTranslationsData).length === 0) {
  console.log('No missing translations found.');
  process.exit(0);
}

const outputFileName =
  argv.outputFile ||
  argv.translationsFile.slice(0, argv.translationsFile.lastIndexOf('.')) + '_empty.json';
// Write the empty translations data to the output file
fs.writeFileSync(outputFileName, JSON.stringify(emptyTranslationsData, null, 2));

console.log(`Created ${outputFileName}`);
