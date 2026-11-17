/*
 * Copyright 2026 The Kubernetes Authors
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

module.exports = {
  cli: ['bin/headlamp-plugin.js', 'bin/typescript.js'],
  configuration: [
    'config/.storybook/HeadlampTheme.js',
    'config/.storybook/main.mjs',
    'config/.storybook/manager.js',
    'config/.storybook/preview.tsx',
    'config/i18next-parser.config.js',
    'config/vite-plugin-name-injection.mjs',
    'config/vite.config.mjs',
  ],
  maintenance: [
    'dependencies-sync.js',
    'scripts/bundle-examples.js',
    'scripts/copy-package-lock.js',
    'scripts/copy-static-assets.js',
    'scripts/fetch-official-plugins.js',
    'scripts/git-hash-utils.js',
  ],
};
