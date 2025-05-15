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
import * as filesFilter from '../../filesFilter/filesFilter';
import mdiIcons from './icons';

// the usedIcons array is used to check that all icons are used in the frontend
// we take the keys from the mdiIcons and add the prefix to it as a string
const usedIcons = Object.keys(mdiIcons.icons).map(icon => `${mdiIcons.prefix}:${icon}`);
const usedAliases = Object.keys(mdiIcons.aliases).map(alias => `${mdiIcons.prefix}:${alias}`);

const checkIcons = async () => {
  const files = filesFilter.sync('^.*\\.tsx$', { ignore: /node_modules/ });

  const unusedIcons = [];

  for (const file of files) {
    const content = await fs.readFileSync(file, 'utf8');
    // this will find all matches of a word starting with 'mdi:' and includes a dash
    const regex = /mdi:[\w-]+/g;

    let match: any;
    while ((match = regex.exec(content)) !== null) {
      if (!usedIcons.includes(match[0]) && !usedAliases.includes(match[0])) {
        unusedIcons.push({
          icon: match[0],
          file,
        });
      }
    }
  }

  for (let i = 0; i < unusedIcons.length; i++) {
    error(
      `Icon ${unusedIcons[i].icon} from file ${unusedIcons[i].file} is not cached for offline use `
    );
  }

  return unusedIcons.length === 0;
};

describe('Icon tests', () => {
  test('Check icon', async () => {
    const result = await checkIcons();
    expect(result).toBe(true);
  });
});
