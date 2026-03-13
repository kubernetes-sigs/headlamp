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

export interface KubeResourceClaim extends KubeObjectInterface {
  spec?: {
    devices?: {
      requests?: {
        name?: string;
        deviceClassName?: string;
        selectors?: {
          cel?: {
            expression?: string;
          };
        }[];
        allocationMode?: string;
        count?: number;
      }[];
      constraints?: {
        requests?: string[];
        matchAttribute?: string;
      }[];
      config?: {
        opaque?: {
          driver?: string;
          parameters?: object;
        };
        requests?: string[];
      }[];
    };
  };
  status?: {
    allocation?: {
      devices?: {
        results?: {
          request?: string;
          driver?: string;
          pool?: string;
          device?: string;
        }[];
      };
      nodeSelector?: object;
    };
    reservedFor?: {
      apiGroup?: string;
      resource?: string;
      name?: string;
      uid?: string;
    }[];
    deallocationRequested?: boolean;
  };
}

class ResourceClaim extends KubeObject<KubeResourceClaim> {
  static kind = 'ResourceClaim';
  static apiName = 'resourceclaims';
  static apiVersion = 'resource.k8s.io/v1';
  static isNamespaced = true;

  static getBaseObject(): KubeResourceClaim {
    const baseObject = super.getBaseObject() as KubeResourceClaim;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
    };
    baseObject.spec = {};
    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  static get listRoute() {
    return 'resourceClaims';
  }

  static get pluralName() {
    return 'resourceclaims';
  }
}

export default ResourceClaim;
