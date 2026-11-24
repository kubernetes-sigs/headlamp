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

import chalk from 'chalk';
import * as semver from 'semver';

/**
 * Sanitizes a version string by trimming whitespace and removing any leading 'v' if present.
 * Warns the user if the input contained a leading 'v'.
 *
 * @param version The version string to sanitize
 * @returns The sanitized version string
 */
export function sanitizeVersion(version: string): string {
  const trimmed = version.trim();
  if (/^[vV]/.test(trimmed)) {
    const sanitized = trimmed.substring(1);
    console.log(chalk.yellow(`Warning: Version "${version}" contains a leading 'v' prefix. The prefix has been removed.`));
    console.log(chalk.yellow(`Using version "${sanitized}" instead.`));
    return sanitized;
  }
  return trimmed;
}

/**
 * Validates if a version string is a strict semantic version (no leading/trailing whitespace, no leading 'v' or '=', and no build metadata).
 * Allows standard semver (e.g. 0.24.0) and prerelease versions (e.g. 0.24.0-rc1).
 *
 * @param version The version string to validate
 * @returns True if valid, false otherwise
 */
export function isValidVersion(version: string): boolean {
  if (version !== version.trim()) {
    return false;
  }
  if (/^[vV=]/.test(version) || version.includes('+')) {
    return false;
  }
  return semver.valid(version) === version;
}
