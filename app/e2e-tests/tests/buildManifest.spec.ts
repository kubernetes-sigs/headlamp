/*
 * Copyright 2026 The Kubernetes Authors
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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const appPath = path.resolve(__dirname, '../..');

test('keeps the MCP adapter out of the Electron startup bundle', () => {
  const mainBundle = fs.readFileSync(path.join(appPath, 'build', 'main.js'), 'utf8');
  const adapterBundlePath = path.join(appPath, 'build', 'mcp', 'MCPAdapter.js');

  expect(fs.existsSync(adapterBundlePath)).toBe(true);
  expect(mainBundle).toContain('./mcp/MCPAdapter.js');
  expect(mainBundle).not.toContain('@modelcontextprotocol/sdk');
  expect(fs.statSync(adapterBundlePath).size).toBeGreaterThan(100_000);
});

test('custom platform metadata reaches the Electron Builder configuration', () => {
  const manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-build-manifest-'));
  const manifestFile = path.join(manifestDir, 'app-build-manifest.json');
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({
      platforms: {
        linux: { executableName: 'branded-headlamp' },
        mac: { appId: 'io.example.branded-headlamp' },
        win: { artifactName: 'branded-${version}.${ext}' },
      },
    })
  );

  try {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        "const { getConfig } = require('app-builder-lib/out/util/config/config'); getConfig(process.cwd(), 'electron-builder.config.ts', {}).then(config => process.stdout.write('HEADLAMP_CONFIG_JSON=' + JSON.stringify({ linux: config.linux, mac: config.mac, win: config.win })));",
      ],
      {
        cwd: appPath,
        encoding: 'utf8',
        env: { ...process.env, HEADLAMP_BUILD_MANIFEST: manifestFile },
      }
    );
    const config = JSON.parse(output.split('HEADLAMP_CONFIG_JSON=')[1]);

    expect(config.linux.executableName).toBe('branded-headlamp');
    expect(config.linux.category).toBe('Network');
    expect(config.mac.appId).toBe('io.example.branded-headlamp');
    expect(config.mac.hardenedRuntime).toBe(true);
    expect(config.win.artifactName).toBe('branded-${version}.${ext}');
    expect(config.win.target).toEqual(['nsis']);
  } finally {
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});
