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

import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const initializationOrder = vi.hoisted(() => [] as string[]);

vi.mock('./runtimeProductIdentity', () => {
  initializationOrder.push('runtimeProductIdentity');
  return {};
});

vi.mock('./main', () => {
  initializationOrder.push('main');
  return {};
});

await import('./bootstrap');

describe('Electron bootstrap', () => {
  it('applies runtime product identity before loading the main process', () => {
    expect(initializationOrder).toEqual(['runtimeProductIdentity', 'main']);
  });

  it('is the Electron main-process build entry', () => {
    const buildScript = fs.readFileSync(
      new URL('../scripts/build-electron.js', import.meta.url),
      'utf8'
    );

    expect(buildScript).toContain(
      "entryPoints: [path.resolve(__dirname, '../electron/bootstrap.ts')]"
    );
  });
});
