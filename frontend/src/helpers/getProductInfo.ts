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

/**
 * @returns the 'VERSION' of the app and the 'GIT_VERSION' of the app.
 */
export function getVersion() {
  return {
    VERSION: import.meta.env.REACT_APP_HEADLAMP_VERSION,
    GIT_VERSION: import.meta.env.REACT_APP_HEADLAMP_GIT_VERSION,
  };
}
/**
 * @returns the product name of the app, or undefined if it's not set.
 */
export function getProductName(): string | undefined {
  return import.meta.env.REACT_APP_HEADLAMP_PRODUCT_NAME;
}

/**
 * @returns The version of the product distribution, or undefined when it is not set.
 */
export function getProductVersion(): string | undefined {
  return import.meta.env.REACT_APP_HEADLAMP_PRODUCT_VERSION;
}

/**
 * @returns The product distribution version when configured, otherwise the Headlamp version.
 */
export function getDisplayVersion(): string | undefined {
  return getProductVersion() || getVersion().VERSION;
}
