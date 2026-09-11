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

import './index'; // this import will init window.pluginLib
import { describe, expect, it } from 'vitest';

describe('pluginLib variable', () => {
  it('should stay the same for plugin compatibility', async () => {
    const externalLibs = [
      'Iconify',
      'Lodash',
      'MonacoEditor',
      'MuiCore',
      'MuiLab',
      'MuiMaterial',
      'MuiStyles',
      'Notistack',
      'React',
      'ReactDOM',
      'ReactJSX',
      'ReactMonacoEditor',
      'ReactRedux',
      'ReactRouter',
      'Recharts',
    ];
    // External libraries that we bundle can have different values per OS
    // So we're just going to check if they're present or not
    externalLibs.forEach(lib => {
      window.pluginLib[lib] = window.pluginLib[lib] ? 'Present' : 'Missing';
    });

    await expect(window.pluginLib).toMatchFileSnapshot('__snapshots__/pluginLib.snapshot');
  });

  it('should not expose queryClient to plugins', () => {
    // queryClient is an internal singleton that plugins must not access directly.
    // Exposing it lets plugins invalidate or mutate queries belonging to other
    // plugins or to Headlamp core, breaking isolation and causing subtle bugs.
    // It's an implementation detail of our pluginLib that plugins must not rely on.
    expect(window.pluginLib).not.toHaveProperty('queryClient');
  });

  it('should expose the documented public plugin API', () => {
    // These are the properties plugins are documented to rely on, either via
    // the prose docs (docs/development/plugins/functionality/index.md) or via
    // the @kinvolk/headlamp-plugin externals mapping
    // (plugins/headlamp-plugin/config/vite.config.mjs). Removing any of these
    // would be a breaking change for existing plugins.
    const documentedApi = [
      // Named directly in the functionality docs as "the main ones".
      'K8s',
      'Headlamp',
      'CommonComponents',
      'Notification',
      'Router',
      'Activity',
      // Mapped by @kinvolk/headlamp-plugin's externals config.
      'ApiProxy',
      'Crd',
      'Utils',
      // The Plugin base class and registerPlugin-adjacent helpers.
      'Plugin',
      'useTranslation',
      // Registry helpers re-exported from ./registry.
      'registerSidebarEntry',
      'registerRoute',
      'registerAppBarAction',
      'registerDetailsViewSection',
      'registerAppLogo',
      'registerClusterChooser',
      'registerPluginSettings',
    ];

    documentedApi.forEach(key => {
      expect(window.pluginLib).toHaveProperty(key);
    });
  });
});
