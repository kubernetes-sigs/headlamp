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

import { getBaseUrl } from './getBaseUrl';
import { isDevMode } from './isDevMode';
import { isDockerDesktop } from './isDockerDesktop';
import { isElectron } from './isElectron';

/**
 * @returns URL depending on dev-mode/electron/docker desktop, base-url, and window.location.origin.
 *
 * @example isDevMode | isElectron returns 'http://localhost:4466/'
 * @example isDockerDesktop returns 'http://localhost:64446/'
 * @example base-url set as '/headlamp' returns '/headlamp/'
 * @example isDevMode | isElectron and base-url is set
 *          it returns 'http://localhost:4466/headlamp/'
 * @example returns 'https://headlamp.example.com/'using the window.location.origin of browser
 *
 */
export function getAppUrl(): string {
  let url = isDevMode() || isElectron() ? 'http://localhost:4466' : window.location.origin;
  if (isDockerDesktop()) {
    url = 'http://localhost:64446';
  }

  const baseUrl = getBaseUrl();
  url += baseUrl ? baseUrl + '/' : '/';

  return url;
}
