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
import type { KubeResourceClaim } from './resourceClaim';

export interface KubeResourceClaimTemplate extends KubeObjectInterface {
  spec?: {
    metadata?: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
    };
    spec?: KubeResourceClaim['spec'];
  };
}

class ResourceClaimTemplate extends KubeObject<KubeResourceClaimTemplate> {
  static kind = 'ResourceClaimTemplate';
  static apiName = 'resourceclaimtemplates';
  static apiVersion = 'resource.k8s.io/v1';
  static isNamespaced = true;

  static getBaseObject(): KubeResourceClaimTemplate {
    const baseObject = super.getBaseObject() as KubeResourceClaimTemplate;
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

  static get listRoute() {
    return 'resourceClaimTemplates';
  }

  static get pluralName() {
    return 'resourceclaimtemplates';
  }
}

export default ResourceClaimTemplate;
