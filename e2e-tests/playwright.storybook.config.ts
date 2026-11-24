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

export default defineConfig({
  testDir: './storybook-tests',
  use: {
    baseURL: 'http://127.0.0.1:6007',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'cd ../frontend && npm exec storybook dev -- --ci --host 127.0.0.1 --port 6007',
    url: 'http://127.0.0.1:6007',
    reuseExistingServer: !process.env.CI,
    // A cold Storybook dev start on a CI runner regularly exceeds Playwright's
    // 60s default.
    timeout: 180_000,
  },
});
