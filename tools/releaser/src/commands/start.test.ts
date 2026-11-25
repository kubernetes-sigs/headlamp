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

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Command } from 'commander';
import { startRelease } from './start.js';

for (const skipBranch of [true, false]) {
  test(`start ${skipBranch ? '--no-branch preserves' : 'by default creates'} the branch`, t => {
    const originalCwd = process.cwd();
    const temporaryRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'releaser-start-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' }).trim();
    try {
      process.chdir(temporaryRepo);
      git('init', '-q', '--initial-branch=original');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.com',
        'commit', '-q', '--allow-empty', '-m', 'Initial fixture');
      t.mock.method(console, 'log', () => {});
      t.mock.method(console, 'error', () => {});
      const stopped = new Error('Stopped before release file updates');
      t.mock.method(process, 'exit', () => { throw stopped; });
      const command = new Command()
        .argument('<release-version>')
        .option('--no-branch')
        .action(startRelease);
      // No app/package.json: stop after branch selection, before npm or commits.
      assert.throws(() => command.parse(
        ['1.2.3', ...(skipBranch ? ['--no-branch'] : [])], { from: 'user' }
      ), error => error === stopped);
      assert.equal(git('branch', '--show-current'), skipBranch ? 'original' : 'hl-rc-1.2.3');
      assert.equal(git('rev-list', '--count', 'HEAD'), '1');
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(temporaryRepo, { recursive: true, force: true });
    }
  });
}
