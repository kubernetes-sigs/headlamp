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
import * as AllComps from '.';

const avoidCheck = [
  '.stories',
  '.test',
  'index',
  '__snapshots__',
  // Not exported on purpose
  'ReleaseNotes',
  'ActionsNotifier',
  'AlertNotification',
  'ErrorBoundary',
];

const checkExports = [
  'ActionButton',
  'BackLink',
  'Chart',
  'ConfirmDialog',
  'ConfirmButton',
  'CreateResourceButton',
  'Dialog',
  'EmptyContent',
  'ErrorPage',
  'InnerTable',
  'Label',
  'LabelListItem',
  'Link',
  'Loader',
  'LogViewer',
  'NamespacesAutocomplete',
  'NameValueTable',
  'Resource',
  'SectionBox',
  'SectionFilterHeader',
  'SectionHeader',
  'ShowHideLabel',
  'SimpleTable',
  'Table',
  'Tabs',
  'Terminal',
  'TileChart',
  'TimezoneSelect',
  'Tooltip',
  'ObjectEventList',
];

function getFilesToVerify() {
  const filesToVerify: string[] = [];
  fs.readdirSync(__dirname).forEach(file => {
    const fileNoSuffix = file.replace(/\.[^/.]+$/, '');
    if (fileNoSuffix && !avoidCheck.find(suffix => fileNoSuffix.endsWith(suffix))) {
      filesToVerify.push(fileNoSuffix);
    }
  });

  return filesToVerify;
}

const filesToVerify = getFilesToVerify();

describe('Import tests', () => {
  test('Left out imports', () => {
    filesToVerify.forEach((file: string) => {
      expect(checkExports).toContain(file);
    });
  });

  // Not important, but just for the sake of keeping this file clean.
  test('Left over imports', () => {
    checkExports.forEach((file: string) => {
      expect(filesToVerify).toContain(file);
    });
  });

  test('Check imports', async () => {
    for (const file of filesToVerify) {
      const r = await import(`./${file}`);

      // Check that all components are exported.
      for (const key in r) {
        if (key === 'default') {
          // If default, then we try to import by file name.
          expect(AllComps).toHaveProperty(file);
        } else {
          expect(AllComps).toHaveProperty(key);
        }
      }
    }
  });
});
