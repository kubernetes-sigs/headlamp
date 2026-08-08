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
  spec: {
    devices?: {
      requests?: Array<{
        name: string;
        deviceClassName: string;
        selectors?: Array<{
          cel?: {
            expression: string;
          };
        }>;
        allocationMode?: string;
        adminAccess?: boolean;
      }>;
      config?: Array<{
        requests?: string[];
        opaque?: {
          driver: string;
          parameters: any;
        };
      }>;
    };
    [key: string]: any;
  };
  status?: {
    allocation?: {
      nodeSelector?: {
        nodeSelectorTerms: Array<any>;
      };
      devices?: {
        results?: Array<{
          request: string;
          driver: string;
          pool: string;
          device: string;
        }>;
      };
    };
    reservedFor?: Array<{
      resource: string;
      group: string;
      name: string;
      uid: string;
    }>;
    devices?: Array<any>;
  };
}

class ResourceClaim extends KubeObject<KubeResourceClaim> {
  static kind = 'ResourceClaim';
  static apiName = 'resourceclaims';
  static apiVersion = 'resource.k8s.io/v1';
  static isNamespaced = true;

  static getBaseObject(): KubeResourceClaim {
    return super.getBaseObject() as KubeResourceClaim;
  }

  static get listRoute() {
    return 'resourceclaims';
  }

  static get pluralName() {
    return 'resourceclaims';
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }
}

export default ResourceClaim;
