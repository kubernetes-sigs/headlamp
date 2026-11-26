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
import VolumeAttachment from './volumeAttachment';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function makeVolumeAttachment(status?: any) {
  return new VolumeAttachment({
    apiVersion: 'storage.k8s.io/v1',
    kind: 'VolumeAttachment',
    metadata: {
      name: 'my-volume-attachment',
      uid: 'uid',
      creationTimestamp: '2025-01-01T00:00:00Z',
    },
    spec: {
      attacher: 'csi.test',
      nodeName: 'my-node',
      source: { persistentVolumeName: 'my-pv' },
    },
    status,
  });
}

describe('VolumeAttachment isAttached', () => {
  it('is true when the status reports attached', () => {
    expect(makeVolumeAttachment({ attached: true }).isAttached).toBe(true);
  });

  it('is false when attached is false', () => {
    expect(makeVolumeAttachment({ attached: false }).isAttached).toBe(false);
  });

  it('is false when there is no status', () => {
    expect(makeVolumeAttachment().isAttached).toBe(false);
  });
});
