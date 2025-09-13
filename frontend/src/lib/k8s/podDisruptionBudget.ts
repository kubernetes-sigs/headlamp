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

export interface KubePDB extends KubeObjectInterface {
  spec: {
    selector: {
      matchLabels: {
        [key: string]: string;
      };
      matchExpressions?: {
        key: string;
        operator: string;
        values: string[];
      };
    };
    minAvailable?: number;
    maxUnavailable?: number;
  };
  status: {
    currentHealthy: number;
    desiredHealthy: number;
    disruptionsAllowed: number;
    expectedPods: number;
    observedGeneration: number;
    disruptedPods?: {
      [key: string]: string;
    };
    conditions: {
      type: string;
      status: string;
      reason: string;
      observedGeneration: number;
      message: string;
      lastTransitionTime: string;
    }[];
  };
}

class PDB extends KubeObject<KubePDB> {
  static kind = 'PodDisruptionBudget';
  static apiName = 'poddisruptionbudgets';
  static apiVersion = 'policy/v1';
  static isNamespaced = true;

  static getBaseObject(): KubePDB {
    const baseObject = super.getBaseObject() as KubePDB;
    baseObject.spec = { selector: { matchLabels: {} } };
    return baseObject;
  }

  get spec(): KubePDB['spec'] {
    return this.jsonData.spec;
  }

  get status(): KubePDB['status'] {
    return this.jsonData.status;
  }

  get selectors(): string[] {
    const selectors: string[] = [];
    Object.keys(this.spec.selector.matchLabels).forEach(key => {
      selectors.push(`${key}: ${this.spec.selector.matchLabels[key]}`);
    });
    return selectors;
  }
}

export default PDB;
