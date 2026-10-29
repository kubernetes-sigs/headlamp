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

export interface CSINodeDriver {
  name: string;
  nodeID: string;
  topologyKeys?: string[];
  allocatable?: {
    count?: number;
  };
}

export interface KubeCSINode extends KubeObjectInterface {
  spec: {
    drivers: CSINodeDriver[];
  };
}

class CSINode extends KubeObject<KubeCSINode> {
  static kind = 'CSINode';
  static apiName = 'csinodes';
  static apiVersion = 'storage.k8s.io/v1';
  static isNamespaced = false;

  static getBaseObject(): KubeCSINode {
    const baseObject = super.getBaseObject() as KubeCSINode;
    baseObject.spec = {
      drivers: [],
    };
    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }

  get drivers(): CSINodeDriver[] {
    return this.jsonData.spec?.drivers ?? [];
  }

  static get listRoute() {
    return 'csiNodes';
  }

  static get pluralName() {
    return 'csinodes';
  }
}

export default CSINode;
