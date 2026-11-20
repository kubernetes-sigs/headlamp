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

/** Builds the settings URL without interpreting cluster names as URL syntax. */
export function getClusterSettingsURL(cluster: string | null | undefined): string {
  const search = new URLSearchParams();
  if (cluster) {
    search.set('c', cluster);
  }
  const query = search.toString();
  return `/settings/cluster${query ? `?${query}` : ''}`;
}
