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
 * The name of the plugin currently executing its top-level (synchronous) load code.
 *
 * Set by `runPluginInner` (in `plugin/index.ts`) for the duration of each plugin's
 * synchronous execution, since plugins are run one at a time via a sequential `forEach`.
 * Used by `registry.tsx` to attribute `register*` calls to the plugin that made them, so
 * contributions can later be filtered by that plugin's `clusterSelector`.
 *
 * Only covers registrations made synchronously during load — a `register*` call made from
 * inside an async callback (e.g. a `.then()` or `setTimeout`) after the plugin has finished
 * loading will see this as `null` (or whichever plugin loads next), since by then execution
 * has moved on.
 *
 * Lives in its own module (rather than `plugin/index.ts`) so that `registry.tsx` can read it
 * without creating a circular import with `plugin/index.ts` (which itself imports
 * `registry.tsx`).
 */
export let currentPluginName: string | null = null;

/**
 * Sets the name of the plugin currently executing its top-level load code.
 *
 * @param name - The plugin's package name, or `null` once it has finished loading.
 */
export function setCurrentPluginName(name: string | null) {
  currentPluginName = name;
}
