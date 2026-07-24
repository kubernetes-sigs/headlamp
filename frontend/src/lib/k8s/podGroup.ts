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

import { request } from './api/v1/clusterRequests';
import type { KubeCondition } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

/** Condition reporting whether the group's scheduling requirement has been satisfied. */
export const POD_GROUP_SCHEDULED_CONDITION = 'PodGroupScheduled';

/**
 * How the pods of a group are scheduled. Exactly one field is set: `gang` for
 * all-or-nothing semantics, `basic` for standard Kubernetes scheduling.
 */
export interface PodGroupSchedulingPolicy {
  basic?: Record<string, never>;
  gang?: {
    minCount: number;
  };
}

/** How v1alpha2 references the Workload a group was templated from. */
export interface PodGroupTemplateReference {
  workload?: {
    workloadName: string;
    podGroupTemplateName: string;
  };
}

/** How v1alpha3 references the Workload a group was templated from. */
export interface PodGroupWorkloadReference {
  workloadName: string;
  templateName: string;
}

export interface PodGroupResourceClaim {
  name: string;
  resourceClaimName?: string;
  resourceClaimTemplateName?: string;
}

/** Scheduling constraints copied from a PodGroupTemplate. */
export interface PodGroupSchedulingConstraints {
  topology?: { key: string }[];
}

/**
 * How v1alpha3 describes which pods a disruption affects. Exactly one field is set:
 * `single` matches the v1alpha2 'Pod' mode, `all` matches 'PodGroup'.
 */
export interface PodGroupDisruptionMode {
  single?: Record<string, never>;
  all?: Record<string, never>;
}

export interface PodGroupSpec {
  schedulingPolicy: PodGroupSchedulingPolicy;
  /** Served by v1alpha2. v1alpha3 uses `workloadRef` instead. */
  podGroupTemplateRef?: PodGroupTemplateReference;
  /** Served by v1alpha3. v1alpha2 uses `podGroupTemplateRef` instead. */
  workloadRef?: PodGroupWorkloadReference;
  /** The composite group this group belongs to, when nested. Served by v1alpha3. */
  parentCompositePodGroupName?: string;
  /** Set only when the WorkloadAwarePreemption feature gate is enabled. */
  priorityClassName?: string;
  priority?: number;
  /** Served by v1alpha3. Whether preemption may evict lower priority pods. */
  preemptionPolicy?: 'PreemptLowerPriority' | 'Never';
  /**
   * v1alpha2 serves this as the string 'Pod' or 'PodGroup'; v1alpha3 serves it as an
   * object with a `single` or `all` field. Read it through the `disruptionMode` getter.
   */
  disruptionMode?: 'Pod' | 'PodGroup' | PodGroupDisruptionMode;
  /** Set only when the TopologyAwareWorkloadScheduling feature gate is enabled. */
  schedulingConstraints?: PodGroupSchedulingConstraints;
  /** Set only when the DRAWorkloadResourceClaims feature gate is enabled. */
  resourceClaims?: PodGroupResourceClaim[];
}

export interface KubePodGroup extends KubeObjectInterface {
  spec: PodGroupSpec;
  status?: {
    conditions?: KubeCondition[];
  };
}

/**
 * Human readable name of the policy a scheduling policy describes.
 * @param policy - The scheduling policy of a PodGroup or of a Workload's template.
 * @returns 'Gang', 'Basic', or undefined when no policy is set.
 */
export function getSchedulingPolicyKind(
  policy: PodGroupSchedulingPolicy | undefined
): string | undefined {
  if (policy?.gang) {
    return 'Gang';
  }
  if (policy?.basic) {
    return 'Basic';
  }
  return undefined;
}

/**
 * Human readable disruption mode across API versions. v1alpha2 uses the strings
 * 'Pod'/'PodGroup'; v1alpha3 uses an object with a `single` or `all` field. Both
 * describe the same choice: disrupt one pod at a time, or the whole group together.
 * @param mode - The disruptionMode field of a PodGroup spec.
 * @returns 'Pod', 'PodGroup', or undefined when no mode is set.
 */
export function getDisruptionMode(
  mode: PodGroupSpec['disruptionMode']
): 'Pod' | 'PodGroup' | undefined {
  if (typeof mode === 'string') {
    return mode;
  }
  if (mode?.single) {
    return 'Pod';
  }
  if (mode?.all) {
    return 'PodGroup';
  }
  return undefined;
}

class PodGroup extends KubeObject<KubePodGroup> {
  static kind = 'PodGroup';
  static apiName = 'podgroups';
  static apiVersion = ['scheduling.k8s.io/v1alpha3', 'scheduling.k8s.io/v1alpha2'];
  static isNamespaced = true;

  /**
   * Whether the cluster serves the workload aware scheduling APIs, which requires the
   * alpha GenericWorkload feature gate to be enabled.
   *
   * This asks for each candidate version directly instead of using apiDiscovery, because
   * discovery only reports the first version of each group and scheduling.k8s.io also
   * serves v1.
   *
   * @param cluster - The cluster to check.
   * @returns true when the PodGroup resource is served.
   */
  static async isEnabled(cluster: string): Promise<boolean> {
    for (const version of PodGroup.apiVersion) {
      try {
        const response = await request(`/apis/${version}`, { cluster });
        if (
          response?.resources?.some(
            (resource: { name?: string }) => resource.name === PodGroup.apiName
          )
        ) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  /** Which scheduling policy this group uses, e.g. 'Gang' or 'Basic'. */
  get policyKind(): string | undefined {
    return getSchedulingPolicyKind(this.spec?.schedulingPolicy);
  }

  /** Pods that must be schedulable together, when the gang policy is used. */
  get minCount(): number | undefined {
    return this.spec?.schedulingPolicy?.gang?.minCount;
  }

  /** Name of the Workload this group was templated from, if any. */
  get workloadName(): string | undefined {
    return (
      this.spec?.workloadRef?.workloadName ?? this.spec?.podGroupTemplateRef?.workload?.workloadName
    );
  }

  /** Name of the template within the Workload this group was created from, if any. */
  get podGroupTemplateName(): string | undefined {
    return (
      this.spec?.workloadRef?.templateName ??
      this.spec?.podGroupTemplateRef?.workload?.podGroupTemplateName
    );
  }

  /** Which pods a disruption affects: 'Pod' one at a time, or 'PodGroup' all together. */
  get disruptionMode(): 'Pod' | 'PodGroup' | undefined {
    return getDisruptionMode(this.spec?.disruptionMode);
  }

  /** The composite group this group belongs to, when nested. */
  get parentCompositePodGroupName(): string | undefined {
    return this.spec?.parentCompositePodGroupName;
  }

  get schedulingCondition(): KubeCondition | undefined {
    return this.status?.conditions?.find(
      condition => condition.type === POD_GROUP_SCHEDULED_CONDITION
    );
  }
}

export default PodGroup;
