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

import { isElectron } from './isElectron';

declare global {
  interface Window {
    /**
     * headlampBaseUrl is used to set the base URL for the app.
     *
     * When headlamp is compiled if a baseUrl is set, then it adds this variable to the
     * appropriate base URL from the environment.
     *
     * Read only.
     */
    headlampBaseUrl?: string;
  }
}

/**
 * @returns the baseUrl for the app based on window.headlampBaseUrl or import.meta.env.PUBLIC_URL
 *
 * This could be either '' meaning /, or something like '/headlamp'.
 */
export function getBaseUrl(): string {
  let baseUrl = '';
  if (isElectron()) {
    return '';
  }
  if (window?.headlampBaseUrl !== undefined) {
    baseUrl = window.headlampBaseUrl;
  } else {
    baseUrl = import.meta.env.PUBLIC_URL ? import.meta.env.PUBLIC_URL : '';
  }

  if (baseUrl === './' || baseUrl === '.' || baseUrl === '/') {
    baseUrl = '';
  }
  return baseUrl;
}
