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

/**
 * The Workload resource of the scheduling.k8s.io API group. It is the static
 * template that PodGroups are created from.
 *
 * This lives in schedulingWorkload.ts rather than workload.ts because
 * ./Workload.ts already defines Headlamp's own Workload union type, and the two
 * file names would collide on case insensitive filesystems.
 */

import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import type {
  PodGroupResourceClaim,
  PodGroupSchedulingConstraints,
  PodGroupSchedulingPolicy,
} from './podGroup';

export interface PodGroupTemplate {
  name: string;
  schedulingPolicy: PodGroupSchedulingPolicy;
  schedulingConstraints?: PodGroupSchedulingConstraints;
  resourceClaims?: PodGroupResourceClaim[];
}

export interface WorkloadSpec {
  podGroupTemplates: PodGroupTemplate[];
  /** The object this Workload was created for, such as a Deployment or a Job. */
  controllerRef?: {
    apiGroup?: string;
    kind: string;
    name: string;
  };
}

export interface KubeSchedulingWorkload extends KubeObjectInterface {
  spec: WorkloadSpec;
}

class Workload extends KubeObject<KubeSchedulingWorkload> {
  static kind = 'Workload';
  static apiName = 'workloads';
  static apiVersion = 'scheduling.k8s.io/v1alpha2';
  static isNamespaced = true;

  /**
   * The 'workloads' route name is taken by the Workloads overview page, so this
   * resource uses its own list route.
   */
  static get listRoute() {
    return 'schedulingWorkloads';
  }

  static getBaseObject(): KubeSchedulingWorkload {
    const baseObject = super.getBaseObject() as KubeSchedulingWorkload;
    baseObject.metadata = { ...baseObject.metadata, namespace: '' };
    baseObject.spec = {
      podGroupTemplates: [{ name: '', schedulingPolicy: { gang: { minCount: 1 } } }],
    };
    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }

  get podGroupTemplates(): PodGroupTemplate[] {
    return this.spec?.podGroupTemplates ?? [];
  }
}

export default Workload;
