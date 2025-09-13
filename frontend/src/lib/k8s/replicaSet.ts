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

import type { KubeCondition, KubeContainer, LabelSelector } from './cluster';
import type { KubeMetadata } from './KubeMetadata';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import type { KubePodSpec } from './pod';

export interface KubeReplicaSet extends KubeObjectInterface {
  spec: {
    minReadySeconds: number;
    replicas: number;
    selector: LabelSelector;
    template: {
      metadata?: KubeMetadata;
      spec: KubePodSpec;
    };
    [other: string]: any;
  };
  status: {
    availableReplicas: number;
    conditions: Omit<KubeCondition, 'lastProbeTime' | 'lastUpdateTime'>[];
    fullyLabeledReplicas: number;
    observedGeneration: number;
    readyReplicas: number;
    replicas: number;
  };
}

class ReplicaSet extends KubeObject<KubeReplicaSet> {
  static kind = 'ReplicaSet';
  static apiName = 'replicasets';
  static apiVersion = 'apps/v1';
  static isNamespaced = true;

  get spec(): KubeReplicaSet['spec'] {
    return this.jsonData.spec;
  }

  get status(): KubeReplicaSet['status'] {
    return this.jsonData.status;
  }

  static getBaseObject(): KubeReplicaSet {
    const baseObject = super.getBaseObject() as KubeReplicaSet;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
    };
    baseObject.spec = {
      minReadySeconds: 0,
      replicas: 1,
      selector: {
        matchLabels: { app: 'headlamp' },
      },
      template: {
        spec: {
          containers: [
            {
              name: '',
              image: '',
              imagePullPolicy: 'Always',
            },
          ],
          nodeName: '',
        },
      },
    };
    return baseObject;
  }

  getContainers(): KubeContainer[] {
    return this.spec?.template?.spec?.containers || [];
  }

  getMatchLabelsList(): string[] {
    const labels = this.spec.selector.matchLabels || {};
    return Object.keys(labels).map(key => `${key}=${labels[key]}`);
  }
}

export default ReplicaSet;
