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

import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';

// Please also update: plugins/headlamp-plugin/config/.storybook/main.js

export default {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],

  addons: ['@storybook/addon-links', '@storybook/addon-docs'],

  core: {
    disableTelemetry: true,
  },

  docs: {},

  viteFinal: async config => {
    config.esbuild = {
      ...config.esbuild,
      jsx: 'automatic',
    };

    // Scan preview imports before serving stories to avoid late dependency
    // optimization invalidating chunks while the MSW loader initializes.
    const entries = config.optimizeDeps?.entries;
    config.optimizeDeps = {
      ...config.optimizeDeps,
      entries: [
        ...(Array.isArray(entries) ? entries : entries ? [entries] : []),
        fileURLToPath(new URL('./preview.tsx', import.meta.url)),
      ],
    };

    return config;
  },

  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
} satisfies StorybookConfig;
