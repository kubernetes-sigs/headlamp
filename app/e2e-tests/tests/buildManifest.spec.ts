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
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
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

test('custom manifest settings reach the Electron Builder configuration', () => {
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
      targets: {
        linux: [{ target: 'AppImage', arch: ['x64'] }],
        mac: [{ target: 'dmg', arch: ['arm64'] }],
        win: [{ target: 'nsis', arch: ['x64'] }],
      },
      resources: {
        common: [{ from: './shared', to: 'shared' }],
        linux: [{ from: './tools/linux', to: 'tools' }],
        mac: [{ from: './tools/mac', to: 'tools' }],
        win: [{ from: './tools/windows.exe', to: 'tools/tool.exe' }],
      },
    })
  );

  try {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        "const { getConfig } = require('app-builder-lib/out/util/config/config'); getConfig(process.cwd(), 'electron-builder.config.ts', {}).then(config => process.stdout.write('HEADLAMP_CONFIG_JSON=' + JSON.stringify({ extraResources: config.extraResources, linux: config.linux, mac: config.mac, win: config.win })));",
      ],
      {
        cwd: appPath,
        encoding: 'utf8',
        env: { ...process.env, HEADLAMP_BUILD_MANIFEST: manifestFile },
      }
    );
    const config = JSON.parse(output.split('HEADLAMP_CONFIG_JSON=')[1]);

    expect(config.extraResources).toContainEqual({
      from: path.join(manifestDir, 'shared'),
      to: 'shared',
    });
    expect(config.linux.executableName).toBe('branded-headlamp');
    expect(config.linux.category).toBe('Network');
    expect(config.linux.target).toEqual([{ target: 'AppImage', arch: ['x64'] }]);
    expect(config.linux.extraResources).toContainEqual({
      from: path.join(manifestDir, 'tools/linux'),
      to: 'tools',
    });
    expect(config.mac.appId).toBe('io.example.branded-headlamp');
    expect(config.mac.hardenedRuntime).toBe(true);
    expect(config.mac.target).toEqual([{ target: 'dmg', arch: ['arm64'] }]);
    expect(config.mac.extraResources).toContainEqual({
      from: path.join(manifestDir, 'tools/mac'),
      to: 'tools',
    });
    expect(config.win.artifactName).toBe('branded-${version}.${ext}');
    expect(config.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
    expect(config.win.extraResources).toContainEqual({
      from: path.join(manifestDir, 'tools/windows.exe'),
      to: 'tools/tool.exe',
    });
  } finally {
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});

test('after-pack rejects a packaged resource after it is tampered with', () => {
  const packageDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-package-'));
  const resourcesDirectory = path.join(packageDirectory, 'packaged-resources');
  const resourceFile = path.join(resourcesDirectory, 'tools', 'tool');
  const manifestFile = path.join(packageDirectory, 'app-build-manifest.json');
  fs.mkdirSync(path.dirname(resourceFile), { recursive: true });
  fs.writeFileSync(resourceFile, 'bundled tool');
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({
      verify: [
        {
          path: 'tools/tool',
          sha256: crypto.createHash('sha256').update('bundled tool').digest('hex'),
          platforms: ['linux'],
        },
      ],
    })
  );
  const hookScript = [
    "const path = require('node:path');",
    "const hook = require('./scripts/after-pack.js').default;",
    'const appOutDir = process.argv[1];',
    'hook({',
    '  appOutDir,',
    "  electronPlatformName: 'linux',",
    '  packager: { getResourcesDir: directory => path.join(directory, "packaged-resources") },',
    '}).catch(error => { console.error(error.message); process.exitCode = 1; });',
  ].join('\n');
  const runHook = () =>
    spawnSync(
      process.execPath,
      ['--no-experimental-strip-types', '-e', hookScript, packageDirectory],
      {
        cwd: appPath,
        encoding: 'utf8',
        env: { ...process.env, HEADLAMP_BUILD_MANIFEST: manifestFile },
      }
    );

  try {
    expect(runHook().status).toBe(0);

    fs.writeFileSync(resourceFile, 'tampered tool');
    const tampered = runHook();
    expect(tampered.status).not.toBe(0);
    expect(tampered.stderr).toContain('SHA-256 mismatch for packaged resource tools/tool');
  } finally {
    fs.rmSync(packageDirectory, { recursive: true, force: true });
  }
});
