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

import { filterSources } from './index';
import { PluginInfo } from './pluginsSlice';

describe('filterSources', () => {
  test('when sources is empty, it also returns an empty array', () => {
    const sources: string[] = [];
    const packageInfos: PluginInfo[] = [];
    const settingsPackages = undefined;
    const appMode = false;

    const { sourcesToExecute } = filterSources(
      sources,
      packageInfos,
      appMode,
      '>=0.8.0-alpha.3',
      settingsPackages
    );
    expect(sourcesToExecute.length).toBe(0);
  });

  test('When not in app mode all sources are used', () => {
    const sources = ['source1'];
    const packageInfos = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
        devDependencies: {
          '@kinvolk/headlamp-plugin': '^0.8.0-alpha.3',
        },
      },
    ];
    const settingsPackages = undefined;
    const appMode = false;

    const { sourcesToExecute, incompatiblePlugins } = filterSources(
      sources,
      packageInfos,
      appMode,
      '>=0.8.0-alpha.3',
      settingsPackages
    );
    expect(Object.keys(incompatiblePlugins).length).toBe(0);
    expect(sourcesToExecute[0]).toBe('source1');
  });

  test('packages not enabled are not returned', () => {
    const sources = ['source1'];
    const packageInfos = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
      },
    ];
    const settingsPackages = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
        isEnabled: false,
      },
    ];
    const appMode = true;
    const { sourcesToExecute } = filterSources(
      sources,
      packageInfos,
      appMode,
      '>=0.8.0-alpha.3',
      settingsPackages
    );

    expect(sourcesToExecute.length).toBe(0);
  });

  test('enabled packages are returned', () => {
    const sources = ['source1', 'source2'];
    const packageInfos = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
        devDependencies: {
          '@kinvolk/headlamp-plugin': '^0.8.0-alpha.3',
        },
      },
      {
        name: 'ourplugin2',
        description: 'package description2',
        homepage: 'https://example.com/2',
        version: '1.0.0',
        author: 'author2',
        devDependencies: {
          '@kinvolk/headlamp-plugin': '^0.8.0-alpha.3',
        },
      },
    ];
    const settingsPackages = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
        isEnabled: true,
      },
      {
        name: 'ourplugin2',
        description: 'package description2',
        homepage: 'https://example.com/2',
        version: '1.0.0',
        author: 'author2',
        isEnabled: false,
      },
    ];
    const appMode = true;
    const { sourcesToExecute } = filterSources(
      sources,
      packageInfos,
      appMode,
      '>=0.8.0-alpha.3',
      settingsPackages
    );

    expect(sourcesToExecute.length).toBe(1);
    expect(sourcesToExecute[0]).toBe('source1');
  });

  test('incompatible packages are not included', () => {
    const sources = ['source1', 'source2'];
    const packageInfos = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
        devDependencies: {
          '@kinvolk/headlamp-plugin': '^0.6.0', // set to an older version
        },
      },
      {
        name: 'ourplugin2',
        description: 'package description2',
        homepage: 'https://example.com/2',
        version: '1.0.0',
        author: 'author2',
        devDependencies: {
          '@kinvolk/headlamp-plugin': '^0.8.0-alpha.3',
        },
      },
    ];
    const settingsPackages = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
        isEnabled: true,
      },
      {
        name: 'ourplugin2',
        description: 'package description2',
        homepage: 'https://example.com/2',
        version: '1.0.0',
        author: 'author2',
        isEnabled: true,
      },
    ];
    const appMode = true;
    const { sourcesToExecute, incompatiblePlugins } = filterSources(
      sources,
      packageInfos,
      appMode,
      '>=0.8.0-alpha.3',
      settingsPackages
    );

    expect(sourcesToExecute.length).toBe(1);
    expect(sourcesToExecute[0]).toBe('source2');
    expect(incompatiblePlugins['ourplugin1']).toBeDefined();

    // Now let's check it works ok with compatibility check disabled
    const disabledCompatCheck = filterSources(
      sources,
      packageInfos,
      appMode,
      '', // empty string disables compatibility check
      settingsPackages
    );

    expect(disabledCompatCheck.sourcesToExecute.length).toBe(2);
    expect(disabledCompatCheck.sourcesToExecute[0]).toBe('source1');
    expect(disabledCompatCheck.sourcesToExecute[1]).toBe('source2');
    expect(disabledCompatCheck.incompatiblePlugins['ourplugin1']).not.toBeDefined();
  });
});
