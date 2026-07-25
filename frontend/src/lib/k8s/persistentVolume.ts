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

import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

export interface KubeClaimRef {
  apiVersion?: string;
  kind?: string;
  name?: string;
  namespace?: string;
  uid?: string;
}

/**
 * Volume source keys recognized on a PersistentVolume spec, in the order they should be reported.
 *
 * @see {@link https://kubernetes.io/docs/concepts/storage/persistent-volumes/#types-of-persistent-volumes}
 */
export const PV_SOURCE_TYPES = [
  'csi',
  'hostPath',
  'nfs',
  'local',
  'iscsi',
  'cephfs',
  'rbd',
  'glusterfs',
  'awsElasticBlockStore',
  'gcePersistentDisk',
  'azureDisk',
  'azureFile',
  'fc',
  'flexVolume',
  'flocker',
  'photonPersistentDisk',
  'portworxVolume',
  'scaleIO',
  'storageos',
  'vsphereVolume',
] as const;

export type KubePersistentVolumeSourceKey = (typeof PV_SOURCE_TYPES)[number];

export interface KubePersistentVolume extends KubeObjectInterface {
  spec: {
    capacity: {
      storage: string;
    };
    accessModes?: string[];
    volumeMode?: string;
    persistentVolumeReclaimPolicy?: string;
    storageClassName?: string;
    claimRef?: KubeClaimRef;
    [other: string]: any;
  };
  status: {
    message?: string;
    phase?: string;
    reason?: string;
  };
}

class PersistentVolume extends KubeObject<KubePersistentVolume> {
  static kind = 'PersistentVolume';
  static apiName = 'persistentvolumes';
  static apiVersion = 'v1';
  static isNamespaced = false;

  static getBaseObject(): KubePersistentVolume {
    const baseObject = super.getBaseObject() as KubePersistentVolume;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
    };
    baseObject.spec = {
      capacity: {
        storage: '',
      },
    };
    baseObject.status = {
      message: '',
      phase: '',
      reason: '',
    };
    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  /** First volume-source key set on this PV's spec, e.g. 'csi', 'hostPath'. */
  getSourceType(): KubePersistentVolumeSourceKey | undefined {
    return PV_SOURCE_TYPES.find(key => (this.spec as Record<string, unknown>)?.[key]);
  }
}

export default PersistentVolume;
