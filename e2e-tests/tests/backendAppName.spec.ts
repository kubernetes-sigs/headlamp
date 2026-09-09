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

import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

/** Executes a command without invoking a shell. */
const execFileAsync = promisify(execFile);

test('backend uses the configured application name', async () => {
  const appName = 'E2E Headlamp';
  const tempDirectory = await mkdtemp(join(tmpdir(), 'headlamp-e2e-'));
  const kubeconfig = join(tempDirectory, 'kubeconfig');

  try {
    const { stdout: kindKubeconfig } = await execFileAsync('kind', [
      'get',
      'kubeconfig',
      '--name',
      'test',
    ]);
    await writeFile(kubeconfig, kindKubeconfig);

    const { stdout } = await execFileAsync('kubectl', [
      '--kubeconfig',
      kubeconfig,
      '--context=kind-test',
      'exec',
      '--namespace=kube-system',
      'deployment/headlamp',
      '--',
      'env',
      `HEADLAMP_CONFIG_APP_NAME=${appName}`,
      '/headlamp/headlamp-server',
      '--version',
    ]);

    expect(stdout).toMatch(new RegExp(`^${appName} \\S+ \\(linux/\\S+\\)\\n$`));
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
