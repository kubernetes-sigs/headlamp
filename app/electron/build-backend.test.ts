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

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { mapElectronArchToGoArch } = require('../scripts/build-backend');

describe('Electron architecture mapping', () => {
  it.each([
    ['x64', 'amd64'],
    ['armv7l', 'arm'],
    ['ia32', '386'],
    ['arm64', 'arm64'],
  ])('maps %s to Go architecture %s', (electronArch, goArch) => {
    expect(mapElectronArchToGoArch(electronArch)).toBe(goArch);
  });
});
