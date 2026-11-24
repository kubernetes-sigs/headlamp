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

/** Shared i18next settings used by the frontend and translation parser. */
export interface SharedI18nextConfig {
  /** Separator between a translation key and its context suffix. */
  contextSeparator: string;
  /** Namespaces available to the frontend translation runtime. */
  namespaces: string[];
  /** Namespace used when a translation key does not specify one. */
  defaultNamespace: string;
  /** Path to locale catalogs relative to the i18n source directory. */
  localesPath: string;
}

declare const sharedConfig: SharedI18nextConfig;

export default sharedConfig;
