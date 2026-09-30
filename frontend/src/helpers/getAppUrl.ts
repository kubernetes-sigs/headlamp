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

declare global {
  interface Window {
    /**
     * headlampBackendPort is set by Electron to specify the backend server port.
     * It allows the frontend to connect to the backend on a configurable port.
     */
    headlampBackendPort?: number;
  }
}

/**
 * @returns URL depending on dev-mode/electron/docker desktop, base-url, and window.location.origin.
 *
 * @example isDevMode returns 'http://localhost:4466/'
 * @example isElectron returns '/' until the backend port is confirmed
 * @example isElectron with port 4467 returns 'http://127.0.0.1:4467/'
 * @example isDockerDesktop returns 'http://localhost:64446/'
 * @example base-url set as '/headlamp' returns '/headlamp/'
 * @example isDevMode and base-url is set returns 'http://localhost:4466/headlamp/'
 * @example returns 'https://headlamp.example.com/'using the window.location.origin of browser
 *
 */
export function getAppUrl(): string {
  let url = '';
  let backendPort = 4466;
  let useLocalhost = false;
  let useInternalBackendHost = false;

  if (isElectron()) {
    if (!window?.headlampBackendPort) {
      return '/';
    }
    backendPort = window.headlampBackendPort;
    useInternalBackendHost = true;
  }

  if (isDevMode()) {
    useLocalhost = true;
  }

  if (isDockerDesktop()) {
    backendPort = 64446;
    useLocalhost = true;
  }

  if (useInternalBackendHost) {
    url = `http://127.0.0.1:${backendPort}`;
  } else if (useLocalhost) {
    url = `http://localhost:${backendPort}`;
  } else {
    url = window.location.origin;
  }

  const baseUrl = getBaseUrl();
  url += baseUrl ? baseUrl + '/' : '/';

  return url;
}
