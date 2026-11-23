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
import { getCurrentVersion, createReleaseTag } from '../utils/git.js';

interface TagOptions {
  sign?: boolean;
}

export function tagRelease(options: TagOptions = {}): void {
  const currentVersion = getCurrentVersion();
  const sign = options.sign !== false;
  console.log(
    chalk.blue(`Creating ${sign ? 'signed ' : ''}release tag for version ${currentVersion}...`)
  );

  try {
    createReleaseTag(currentVersion, sign);
    console.log(
      chalk.green(
        `✅ Created ${sign ? 'signed ' : ''}tag v${currentVersion} with message "Release ${currentVersion}"`
      )
    );
    console.log(chalk.green('\nTag created successfully!'));
  } catch (error) {
    console.error(chalk.red('Error creating tag:'));
    console.error(error);
    process.exit(1);
  }
}
