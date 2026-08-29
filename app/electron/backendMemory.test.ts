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

import { describe, expect, it } from 'vitest';
import { withBackendMemoryDefaults } from './backendMemory';

describe('withBackendMemoryDefaults', () => {
  it('uses a lower GC target for the bundled backend', () => {
    expect(withBackendMemoryDefaults({ PATH: '/bin' })).toEqual({
      PATH: '/bin',
      GOGC: '25',
    });
  });

  it('preserves an explicit GC target', () => {
    expect(withBackendMemoryDefaults({ GOGC: '75' }).GOGC).toBe('75');
  });
});
