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

import { ResourceClasses } from '.';
import { request } from './apiProxy';
import { KubeObject } from './KubeObject';
import { KubeObjectInterface } from './KubeObject';
import { KubeObjectClass } from './KubeObject';

type ResourceName = 'cpu' | 'memory' | 'storage' | 'ephemeral-storage';

type UpdateMode = 'Off' | 'Initial' | 'Auto' | 'Recreate';

type EvictionChangeRequirement = 'TargetHigherThanRequests' | 'TargetLowerThanRequests';

interface VpaSpec {
  targetRef: {
    apiVersion: string;
    kind: string;
    name: string;
    namespace?: string;
  };
  updatePolicy?: {
    updateMode: UpdateMode;
    minReplicas?: number;
    evictionRequirements?: {
      resources: {
        resourceName: ResourceName;
      }[];
      changeRequirement: EvictionChangeRequirement;
    }[];
  };
  resourcePolicy?: {
    containerPolicies: {
      containerName: string;
      mode?: UpdateMode;
      minAllowed?: {};
      maxAllowed?: {};
      controlledResources?: ResourceName[];
      controlledValues?: 'RequestsAndLimits' | 'RequestsOnly';
    }[];
  };
  recommenders?: {
    name: string;
  }[];
}

interface VpaStatus {
  conditions: VpaCondition[];
  recommendation?: VpaRecommendation;
}

interface VpaCondition {
  type: string;
  status: string;
  lastTransitionTime: string;
  reason?: string;
  message?: string;
}

interface RecommendationValue {
  cpu?: string;
  memory?: string;
  storage?: string;
  ephemeralStorage?: string;
}

interface VpaRecommendation {
  containerRecommendations: {
    containerName: string;
    lowerBound: RecommendationValue;
    target: RecommendationValue;
    uncappedTarget: RecommendationValue;
    upperBound: RecommendationValue;
  }[];
}

export interface KubeVPA extends KubeObjectInterface {
  spec: VpaSpec;
  status: VpaStatus;
}

class VPA extends KubeObject<KubeVPA> {
  static kind = 'VerticalPodAutoscaler';
  static apiName = 'verticalpodautoscalers';
  static apiVersion = 'autoscaling.k8s.io/v1';
  static isNamespaced = true;

  static getBaseObject(): KubeVPA {
    const baseObject = super.getBaseObject() as KubeVPA;
    baseObject.spec = {
      targetRef: {
        apiVersion: '',
        kind: '',
        name: '',
      },
    };
    return baseObject;
  }

  static async isEnabled(): Promise<boolean> {
    let res;
    try {
      res = await request('/apis/autoscaling.k8s.io/v1');
    } catch (e) {
      return false;
    }
    if (
      res?.resources?.find(
        (r: { name: string; [key: string]: any }) => r?.name === 'verticalpodautoscalers'
      )
    ) {
      return true;
    } else {
      return false;
    }
  }

  get spec(): VpaSpec {
    return this.jsonData.spec;
  }

  get status(): VpaStatus {
    return this.jsonData.status;
  }

  get referenceObject(): KubeObject | null {
    const target = this?.spec?.targetRef;
    if (!target) {
      return null;
    }

    const TargetObjectClass = (ResourceClasses as Record<string, KubeObjectClass>)[target.kind];
    let objInstance: KubeObject | null = null;
    if (!!TargetObjectClass) {
      objInstance = new TargetObjectClass({
        metadata: {
          name: target.name,
          namespace: target.namespace || this.metadata.namespace,
        },
        kind: target.kind,
      } as KubeObjectInterface);
    }
    return objInstance;
  }

  get targetRecommendations(): RecommendationValue | null | undefined {
    if (!this?.status?.recommendation) {
      return null;
    }

    const target = this?.status?.recommendation?.containerRecommendations?.[0]?.target;
    return target;
  }
}

export default VPA;
