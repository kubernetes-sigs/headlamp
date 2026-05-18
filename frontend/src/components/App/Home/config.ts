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

/** Allow selecting multiple clusters on home page. */
export const MULTI_HOME_ENABLED = import.meta.env.REACT_APP_MULTI_HOME_ENABLED === 'true' || true;

/** Show recent clusters on the home page */
export const ENABLE_RECENT_CLUSTERS = import.meta.env.REACT_APP_ENABLE_RECENT_CLUSTERS === 'true';
