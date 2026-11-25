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
import App from '../../App';
import type { KubeVolumeAttributesClass } from './volumeAttributesClass';
import VolumeAttributesClass from './volumeAttributesClass';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeClass = (fields: Partial<KubeVolumeAttributesClass>) =>
  new VolumeAttributesClass({
    kind: 'VolumeAttributesClass',
    apiVersion: 'storage.k8s.io/v1',
    metadata: {
      name: 'gold',
      uid: 'uid-gold',
      creationTimestamp: '2026-09-20T15:00:00Z',
    },
    ...fields,
  });

describe('VolumeAttributesClass', () => {
  it('returns the driver name and parameters', () => {
    const vac = makeClass({ driverName: 'pd.csi.storage.gke.io', parameters: { iops: '4000' } });

    expect(vac.driverName).toBe('pd.csi.storage.gke.io');
    expect(vac.parameters).toEqual({ iops: '4000' });
  });

  it('returns no parameters when the class sets none', () => {
    expect(makeClass({ driverName: 'pd.csi.storage.gke.io' }).parameters).toEqual({});
  });
});
