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

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { runPrecompressBuild } from './precompress-build';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompress-'));
  tempDirs.push(dir);
  return dir;
}

describe('precompress-build', () => {
  it('runs from an installed package with tsx', () => {
    const packageRoot = path.join(makeTempDir(), 'node_modules', 'headlamp');
    const scriptDirectory = path.join(packageRoot, 'frontend', 'scripts');
    const buildDirectory = path.join(packageRoot, 'frontend', 'build');
    const installedScript = path.join(scriptDirectory, 'precompress-build.ts');
    const tsxCli = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');

    fs.mkdirSync(scriptDirectory, { recursive: true });
    fs.mkdirSync(buildDirectory, { recursive: true });
    fs.copyFileSync(
      path.resolve(__dirname, '../package.json'),
      path.join(packageRoot, 'frontend/package.json')
    );
    fs.copyFileSync(path.join(__dirname, 'precompress-build.ts'), installedScript);
    fs.writeFileSync(path.join(buildDirectory, 'main.js'), 'x'.repeat(2048));

    const nodeResult = spawnSync(
      process.execPath,
      ['--experimental-strip-types', installedScript, buildDirectory],
      { encoding: 'utf8' }
    );
    expect(nodeResult.status).not.toBe(0);
    expect(nodeResult.stderr).toContain('ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING');

    const tsxResult = spawnSync(process.execPath, [tsxCli, installedScript, buildDirectory], {
      encoding: 'utf8',
    });
    expect(tsxResult.status, tsxResult.stderr).toBe(0);
    expect(fs.existsSync(path.join(buildDirectory, 'main.js.br'))).toBe(true);
  });

  it('removes orphan .br sidecars', async () => {
    const buildDir = makeTempDir();
    const orphan = path.join(buildDir, 'assets', 'stale.js.br');

    fs.mkdirSync(path.dirname(orphan), { recursive: true });
    fs.writeFileSync(orphan, 'stale-sidecar');

    const result = await runPrecompressBuild(buildDir);

    expect(fs.existsSync(orphan)).toBe(false);
    expect(result.orphanRemoved).toBe(1);
  });

  it('limits compression concurrency with a worker pool', async () => {
    const buildDir = makeTempDir();

    for (let i = 0; i < 6; i++) {
      fs.writeFileSync(path.join(buildDir, `asset-${i}.js`), 'x'.repeat(2048));
    }

    let active = 0;
    let peak = 0;

    await runPrecompressBuild(buildDir, {
      maxConcurrency: 2,
      processFileFn: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 20));
        active--;
        return { raw: 0, br: 0, kept: false };
      },
    });

    expect(peak).toBeLessThanOrEqual(2);
  });
});
