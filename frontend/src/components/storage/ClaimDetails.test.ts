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
import { formatObjectReference } from './ClaimDetails';

describe('formatObjectReference', () => {
  it('falls back to the claim namespace for a local data source', () => {
    expect(
      formatObjectReference(
        { apiGroup: 'snapshot.storage.k8s.io', kind: 'VolumeSnapshot', name: 'daily-backup' },
        'storage-lab'
      )
    ).toBe('snapshot.storage.k8s.io/VolumeSnapshot/daily-backup (storage-lab)');
  });

  it('preserves an explicit data source namespace', () => {
    expect(
      formatObjectReference(
        {
          apiGroup: 'snapshot.storage.k8s.io',
          kind: 'VolumeSnapshot',
          name: 'daily-backup',
          namespace: 'snapshots',
        },
        'storage-lab'
      )
    ).toBe('snapshot.storage.k8s.io/VolumeSnapshot/daily-backup (snapshots)');
  });
});
