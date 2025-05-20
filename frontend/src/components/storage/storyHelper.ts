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

import { KubePersistentVolume } from '../../lib/k8s/persistentVolume';
import { KubePersistentVolumeClaim } from '../../lib/k8s/persistentVolumeClaim';
import { KubeStorageClass } from '../../lib/k8s/storageClass';

export const BASE_SC: KubeStorageClass = {
  apiVersion: 'v1',
  kind: 'StorageClass',
  metadata: {
    creationTimestamp: '2023-04-27T20:31:27Z',
    name: 'my-pvc',
    resourceVersion: '1234',
    uid: 'abc-1234',
  },
  provisioner: 'csi.test',
  reclaimPolicy: 'Delete',
  allowVolumeExpansion: true,
  volumeBindingMode: 'WaitForFirstConsumer',
};

export const BASE_PVC: KubePersistentVolumeClaim = {
  apiVersion: 'v1',
  kind: 'PersistentVolumeClaim',
  metadata: {
    creationTimestamp: '2023-04-27T20:31:27Z',
    finalizers: ['kubernetes.io/pvc-protection'],
    name: 'my-pvc',
    namespace: 'default',
    resourceVersion: '1234',
    uid: 'abc-1234',
  },
  spec: {
    accessModes: ['ReadWriteOnce'],
    resources: {
      requests: {
        storage: '8Gi',
      },
    },
    storageClassName: 'default',
    volumeMode: 'Filesystem',
    volumeName: 'pvc-abc-1234',
  },
  status: {
    accessModes: ['ReadWriteOnce'],
    capacity: {
      storage: '8Gi',
    },
    phase: 'Bound',
  },
};

export const BASE_PV: KubePersistentVolume = {
  apiVersion: 'v1',
  kind: 'PersistentVolume',
  metadata: {
    creationTimestamp: '2023-04-27T20:31:27Z',
    finalizers: ['kubernetes.io/pvc-protection'],
    name: 'my-pvc',
    namespace: 'default',
    resourceVersion: '1234',
    uid: 'abc-1234',
  },
  spec: {
    capacity: {
      storage: '8Gi',
    },
    accessModes: ['ReadWriteOnce'],
    storageClassName: 'default',
    volumeMode: 'Filesystem',
    resources: {
      requests: {
        storage: '',
      },
    },
  },
  status: {
    message: 'test',
    phase: 'Bound',
    reason: 'test',
  },
};
