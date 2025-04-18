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

/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { coverageConfigDefaults } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      env: {
        UNDER_TEST: 'true',
      },
      alias: [
        {
          find: /^monaco-editor$/,
          replacement: __dirname + '/node_modules/monaco-editor/esm/vs/editor/editor.api',
        },
      ],
      fakeTimers: {
        toFake: ['Date', 'setTimeout', 'clearTimeout'],
      },
      coverage: {
        provider: 'istanbul',
        reporter: [['text', { maxCols: 200 }], ['html']],
        exclude: [
          ...coverageConfigDefaults.exclude,
          'node_modules/**',
          'build/**',
          'src/**/*.stories*.{js,jsx,ts,tsx}',
        ],
        include: ['src/**/*.{js,jsx,ts,tsx}'],
      },
      restoreMocks: false,
      setupFiles: ['./src/setupTests.ts'],
    },
  })
);
