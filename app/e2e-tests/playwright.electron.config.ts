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

import { defineConfig, devices } from '@playwright/test';

/**
 * Config for the desktop (Electron) app's e2e specs: this suite launches a
 * real Electron binary against a real minikube cluster via
 * `_electron.launch()`, not a browser page against a running dev server.
 * testMatch scopes this config to just the specs that drive Electron.
 */

export default defineConfig({
  testDir: './tests',
  testMatch: [
    'backendToken.spec.ts',
    'buildManifest.spec.ts',
    'clusterRename.spec.ts',
    'namespaces.spec.ts',
    'clusterAutoConnect.spec.ts',
    'pluginSecureStorage.spec.ts',
    'listenerCleanup.spec.ts',
    'runCommand.spec.ts',
    'updateChecks.spec.ts',
  ],
  timeout: 60 * 1000,
  expect: {
    timeout: 120000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Electron holds a single-instance lock (see clusterRename.spec.ts), and
  // several specs shell out to a real minikube cluster — these specs are
  // not safe to run concurrently regardless of CI.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
