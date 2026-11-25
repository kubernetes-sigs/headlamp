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

import { Page } from '@playwright/test';

/** localStorage key that marks the first-run Welcome dialog as dismissed. */
export const WELCOME_DISMISSED_KEY = 'headlamp.welcome.dismissed';

/**
 * Marks the first-run Welcome dialog as dismissed and reloads, so its modal doesn't block
 * specs that drive the UI. Each spec launches Electron with a fresh profile, where the
 * dialog would otherwise open.
 */
export async function dismissWelcome(page: Page) {
  await page.evaluate(key => localStorage.setItem(key, 'true'), WELCOME_DISMISSED_KEY);
  await page.reload();
  await page.waitForLoadState('load');
}
