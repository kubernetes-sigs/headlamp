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

import fs from 'node:fs';

/**
 * Resolves whether application update checks are enabled.
 *
 * Product metadata takes precedence over the environment setting when it
 * provides a boolean value. Missing or invalid metadata falls back to the
 * existing `HEADLAMP_CHECK_FOR_UPDATES` behavior.
 *
 * @param manifestPath - Path to the application build manifest JSON file.
 * @param environment - Environment variables used as a configuration fallback.
 * @returns Whether the application should check for updates.
 */
export function shouldCheckForAppUpdates(
  manifestPath: string,
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  let buildManifest: unknown = {};
  try {
    buildManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    // Fall back to the environment when product metadata is unavailable.
  }

  if (typeof buildManifest === 'object' && buildManifest !== null) {
    const configuredValue = (buildManifest as { checkForUpdates?: unknown }).checkForUpdates;
    if (typeof configuredValue === 'boolean') {
      return configuredValue;
    }
  }

  return environment.HEADLAMP_CHECK_FOR_UPDATES !== 'false';
}
