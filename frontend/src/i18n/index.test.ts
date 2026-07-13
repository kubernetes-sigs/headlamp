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

import { error } from 'console';
import fs from 'fs';
import * as filesFilter from '../filesFilter/filesFilter';

const path = require('node:path');
const allowlist = require('./allowlist.json');

/*
 * Description:
 * This test will check for duplicate keys in the translation files and will fail if any are found.
 * The allowlist.json file is used to ignore any keys that are intentionally duplicated.
 * - The test will gather all the keys from the translation files and store them in a master list
 * - Then it will organize the master list by language in a wordMap object
 * - Finally it will check for duplicates in each language and fail if any are found
 */
async function checkKeys() {
  const files = filesFilter.sync('^.*\\/i18n\\/locales\\/[^\\/]+\\/[^\\/]+\\.json$', {
    ignore: [
      /node_modules/,
      /^.*\/i18n\/locales\/[^\/]+\/[^\/]+_old\.json$/,
      /^.*\/i18n\/locales\/[^\/]+\/[^\/]+_empty\.json$/,
    ],
  });

  /*
   * Allowlist function scans the json and return if the word is within the allowlist
   */
  function allowlistScan(word: string, lang: string) {
    const allowListLang: any[] = allowlist[lang];
    return allowListLang.some((item: any) => item.wordKey === word);
  }

  /*
   * The contents array is a master list meant to hold every word object before sorting
   */
  const contents: any[] = [];

  for (const file of files) {
    const content = await fs.readFileSync(file, 'utf-8');
    const words = JSON.parse(content);

    /*
     * fileInfo is used to get the language and file name
     */
    const fileInfo = path.parse(file);
    const language = path.basename(fileInfo.dir);
    const fileName = fileInfo.base;

    /*
     * This for loop creates a word object which will later be pushed to the master list
     */
    for (const key in words) {
      contents.push({
        wordKey: key,
        wordValue: words[key],
        lang: language,
        path: file,
        fileName: fileName,
      });
    }
  }

  /*
   * The wordMap object that will be organized by language
   */
  const wordMap: any = {};

  /*
   * Will for loop over each word in the master word list, if the lang does not exist as a key, create it, pair with an array and push to it
   */
  for (let i = 0; i < contents.length; i++) {
    const lang = contents[i].lang;
    if (!wordMap[lang]) {
      wordMap[lang] = [contents[i]];
    }

    wordMap[lang].push(contents[i]);
  }

  let repeatKeyCount = 0;

  /*
   * Will for loop over each language created by the previous loop, creates a knownWords map for every seen word in each language
   */
  for (const lang in wordMap) {
    const knownWords: any = {};

    /*
     * for loop over every word in each language,
     * determine if word is in allowlist
     * if word is not in allowlist and has been seen before mark as duplicate key
     * if word is not in allowlist and not in seen list the word is new
     */
    for (let i = 0; i < wordMap[lang].length; i++) {
      const currentWord = wordMap[lang][i];
      const inAllowlist = allowlistScan(currentWord.wordKey, lang);
      const knownWord = knownWords[currentWord.wordKey];

      if (!inAllowlist && !!knownWord && knownWord.fileName !== currentWord.fileName) {
        repeatKeyCount++;
        error('Error: the key for this translation is already in use');
        error(currentWord);
        error('Error: translation key already in use by:');
        error(knownWords[currentWord.wordKey]);
        error('-------------------------------');
      } else {
        knownWords[currentWord.wordKey] = currentWord;
      }
    }
  }

  return repeatKeyCount === 0;
}

describe('Test for non-intentional repeating translation keys', () => {
  test('Decide which keys are needed if already in use', async () => {
    const result = await checkKeys();
    expect(result).toBe(true);
  });
});
