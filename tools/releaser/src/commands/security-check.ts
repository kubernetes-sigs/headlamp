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
import {
  checkBackendVulnerabilities,
  checkDockerfileSecurity,
  SecurityCheckResult,
} from '../utils/security.js';

const DOCKERFILES = ['Dockerfile', 'Dockerfile.plugins', 'docker-extension/Dockerfile'];

function reportResult(result: SecurityCheckResult): void {
  if (result.skipped) {
    console.log(chalk.yellow(`⚠️  ${result.name}: ${result.message}`));
  } else if (result.passed) {
    console.log(chalk.green(`✅ ${result.name}: ${result.message}`));
  } else {
    console.error(chalk.red(`❌ ${result.name}: ${result.message}`));
  }

  if (result.output && result.output.trim()) {
    console.log(result.output.trim());
  }
}

export async function securityCheck(): Promise<void> {
  console.log(chalk.blue('Running backend and Dockerfile security checks...\n'));

  const results: SecurityCheckResult[] = [
    checkBackendVulnerabilities(),
    ...DOCKERFILES.map(dockerfile => checkDockerfileSecurity(dockerfile)),
  ];

  results.forEach(reportResult);

  const failed = results.filter(result => !result.skipped && !result.passed);
  const skipped = results.filter(result => result.skipped);

  console.log('');

  if (skipped.length > 0) {
    console.log(
      chalk.yellow(`ℹ️  ${skipped.length} check(s) skipped (see warnings above)`)
    );
  }

  if (failed.length > 0) {
    console.error(chalk.red(`❌ ${failed.length} security check(s) failed`));
    process.exit(1);
  }

  if (skipped.length === results.length) {
    console.log(chalk.yellow('⚠️  All security checks were skipped; nothing was actually verified'));
    return;
  }

  console.log(chalk.green('✅ No security issues found'));
}
