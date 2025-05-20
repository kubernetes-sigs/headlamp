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

import { walkSync } from '@nodelib/fs.walk';
import * as path from 'node:path';

interface Options {
  /**
   * A regex pattern to ignore files or directories.
   */
  ignore: RegExp | RegExp[];
}

/**
 * Synchronously matches files based on the provided regex pattern and options.
 *
 * @param regexPattern - The regex pattern to match files against.
 * @param options - An object containing options for the glob operation.
 * @param options.ignore - A regex pattern to ignore files or directories.
 * @returns An array of file paths that match the pattern and do not match the ignore pattern.
 */
export function sync(regexPattern: string, options: Options): string[] {
  const entries: string[] = [];
  const baseDir = path.resolve(__dirname);
  const filePattern = new RegExp(regexPattern);

  walkSync(baseDir, {
    entryFilter: entry => {
      const relativePath = path.relative(baseDir, entry.path);
      // Normalize path to handle windows paths.
      const normalizedPath = relativePath.replace(/\\/g, '/');
      const fileTest = filePattern.test(normalizedPath);
      const ignoreTest = Array.isArray(options.ignore)
        ? options.ignore.some(ignore => ignore.test(normalizedPath))
        : options.ignore.test(normalizedPath);

      return fileTest && !ignoreTest;
    },
    errorFilter: error => {
      console.error(error);
      return false;
    },
  }).forEach(entry => entries.push(entry.path));

  return entries;
}
