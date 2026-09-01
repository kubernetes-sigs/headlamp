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

import type { KubeCondition } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

const RESIZE_CONDITIONS = ['Resizing', 'FileSystemResizePending'];

export interface KubePersistentVolumeClaim extends KubeObjectInterface {
  spec?: {
    accessModes?: string[];
    resources?: {
      limits?: object;
      requests: {
        storage?: string;
        [other: string]: any;
      };
    };
    storageClassName?: string;
    volumeMode?: string;
    volumeName?: string;
    [other: string]: any;
  };
  status?: {
    capacity?: {
      storage?: string;
    };
    phase?: string;
    accessModes?: string[];
    conditions?: KubeCondition[];
    allocatedResources?: {
      storage?: string;
    };
    [other: string]: any;
  };
}

class PersistentVolumeClaim extends KubeObject<KubePersistentVolumeClaim> {
  static kind = 'PersistentVolumeClaim';
  static apiName = 'persistentvolumeclaims';
  static apiVersion = 'v1';
  static isNamespaced = true;

  static getBaseObject(): KubePersistentVolumeClaim {
    const baseObject = super.getBaseObject() as KubePersistentVolumeClaim;

    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
    };

    baseObject.spec = {
      accessModes: ['ReadWriteOnce'],
      resources: {
        requests: {
          storage: '',
        },
      },
    };

    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  /** The size asked for in the spec, which the provider grows the volume towards. */
  get requestedStorage(): string | undefined {
    return this.spec?.resources?.requests?.storage;
  }

  /** Whether the volume, or the file system on it, is still growing towards the request. */
  get resizeCondition(): KubeCondition | undefined {
    return this.status?.conditions?.find(
      condition => RESIZE_CONDITIONS.includes(condition.type) && condition.status === 'True'
    );
  }

  /**
   * Asks the storage provider for a larger volume.
   *
   * Only claims bound to a storage class that allows expansion can grow, and the API
   * rejects a request that is smaller than the current one, because a volume cannot
   * shrink.
   * @param storage - The new size, as a Kubernetes quantity such as '20Gi'.
   * @returns The patched claim.
   */
  expandTo(storage: string) {
    return this.patch({
      spec: {
        resources: {
          requests: {
            storage,
          },
        },
      },
    });
  }
}

export default PersistentVolumeClaim;
