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

import fs from 'fs';
import path from 'path';
import * as filesFilter from '../../filesFilter/filesFilter';
import mdiIcons from './icons';

// the cachedIcons array is used to check that all icons are cached in the frontend
// we take the keys from the mdiIcons and add the prefix to it as a string
const cachedIcons = Object.keys(mdiIcons.icons).map(icon => `${mdiIcons.prefix}:${icon}`);
const cachedAliases = Object.keys(mdiIcons.aliases).map(alias => `${mdiIcons.prefix}:${alias}`);

describe('Icon tests', () => {
  test('Check icon', () => {
    const files = filesFilter.sync('^.*\\.tsx$', {
      ignore: /node_modules/,
      baseDir: path.resolve(__dirname, '..', '..'),
    });

    expect(files.length, 'Source files count').toBeGreaterThan(0);

    const uncachedIcons = new Set<string>();

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      // this will find all matches of a word starting with 'mdi:' and includes a dash
      const regex = /mdi:[\w-]+/g;

      let match: any;
      while ((match = regex.exec(content)) !== null) {
        if (!cachedIcons.includes(match[0]) && !cachedAliases.includes(match[0])) {
          uncachedIcons.add(match[0]);
        }
      }
    }

    if (uncachedIcons.size > 0) {
      console.error(
        'Following icons are not cached for offline use',
        [...uncachedIcons].join(', ')
      );
      console.error('\n\nTo fix this update icons.ts file with the following content:\n');

      const allIconNames = [...new Set([...cachedIcons, ...uncachedIcons])].map(it =>
        it.replace('mdi:', '')
      );

      console.error('https://api.iconify.design/mdi.json?icons=' + allIconNames.join(','));

      console.error(
        '\n\nFollow the link and copy the "icons" field into icons.ts. Make sure existing "aliases" property is kept.'
      );
    }

    expect(uncachedIcons.size, 'Icons with missing cache').toBe(0);
  });
});
