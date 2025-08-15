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
 * isBackstage checks if Headlamp is running in a backstage app
 *
 * @returns true if Headlamp is running in a backstage app
 */
export function isBackstage(): boolean {
  // if running in iframe and the url has /api/headlamp in it, then we are running in backstage
  return window.self !== window.top && window.location.href.includes('/api/headlamp');
}
