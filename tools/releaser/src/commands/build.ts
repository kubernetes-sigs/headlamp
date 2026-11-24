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
import inquirer from 'inquirer';
import { triggerBuildWorkflows } from '../utils/github.js';

interface BuildOptions {
  platform?: string;
  force?: boolean;
}

const VALID_PLATFORMS = ['all', 'windows', 'mac', 'linux'];

export async function buildArtifacts(gitRef: string, options: BuildOptions): Promise<void> {
  const platform = options.platform || 'all';

  // Validate platform
  if (!VALID_PLATFORMS.includes(platform)) {
    console.error(chalk.red(`Error: Invalid platform "${platform}". Valid options are: ${VALID_PLATFORMS.join(', ')}`));
    process.exit(1);
  }

  console.log(chalk.blue(`Triggering build artifacts for platform(s): ${platform}`));
  console.log(chalk.blue(`Using git ref: ${gitRef}`));

  try {
    // Confirm unless --force is used
    if (!options.force) {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: chalk.yellow(`Are you sure you want to trigger build workflows for ${platform} using ref "${gitRef}"?`),
          default: false
        }
      ]);

      if (!confirmed) {
        console.log(chalk.yellow('Build trigger cancelled'));
        return;
      }
    }

    // Trigger the workflows
    const runs = await triggerBuildWorkflows(gitRef, platform);

    console.log(chalk.green(`\n✅ Successfully triggered build workflow(s) for ${platform}`));

    if (runs.length > 0) {
      console.log(chalk.blue('\nTriggered workflow runs:'));
      runs.forEach(run => {
        console.log(chalk.cyan(`  • ${run.name}: ${run.url}`));
      });
    }

    console.log(chalk.blue('\nYou can monitor all workflows at:'));
    console.log(chalk.cyan('https://github.com/kubernetes-sigs/headlamp/actions'));
  } catch (error) {
    console.error(chalk.red('Error triggering build workflows:'));
    console.error(error);
    process.exit(1);
  }
}
