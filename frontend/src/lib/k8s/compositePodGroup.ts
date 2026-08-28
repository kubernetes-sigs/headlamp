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
 * The CompositePodGroup resource of the scheduling.k8s.io API group. It nests pod
 * groups and other composite groups into the hierarchy a workload controller creates
 * from a Workload's compositePodGroupTemplates.
 */

import type { KubeCondition } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import type {
  PodGroupDisruptionMode,
  PodGroupSchedulingConstraints,
  PodGroupWorkloadReference,
} from './podGroup';
import { getSchedulingPolicyKind, isSchedulingResourceServed } from './podGroup';

/**
 * Condition reporting whether the scheduling requirement of the whole subtree below the
 * group has been satisfied. It is terminal: once true it stays true, even after the pods
 * of the subtree are gone.
 */
export const COMPOSITE_POD_GROUP_INITIALLY_SCHEDULED_CONDITION =
  'CompositePodGroupInitiallyScheduled';

/**
 * How the child groups of a composite group are scheduled. Mirrors
 * PodGroupSchedulingPolicy, except that the gang policy counts child groups rather
 * than pods.
 */
export interface CompositePodGroupSchedulingPolicy {
  basic?: Record<string, never>;
  gang?: {
    minGroupCount: number;
  };
}

export interface CompositePodGroupSpec {
  schedulingPolicy: CompositePodGroupSchedulingPolicy;
  /** The Workload and the template within it this group was created from. */
  workloadRef: PodGroupWorkloadReference;
  /** The composite group this one is nested in. Unset on the root of a hierarchy. */
  parentCompositePodGroupName?: string;
  /** Set only when the TopologyAwareWorkloadScheduling feature gate is enabled. */
  schedulingConstraints?: PodGroupSchedulingConstraints;
  disruptionMode?: PodGroupDisruptionMode;
  priorityClassName?: string;
  priority?: number;
  /** Set only when the PodGroupPreemptionPolicy feature gate is enabled. */
  preemptionPolicy?: 'PreemptLowerPriority' | 'Never';
}

export interface KubeCompositePodGroup extends KubeObjectInterface {
  spec: CompositePodGroupSpec;
  status?: {
    conditions?: KubeCondition[];
  };
}

/**
 * Human readable disruption mode of a composite group. The API describes it as one of
 * Single or All: disrupt one child group at a time, or the whole composite together.
 * @param mode - The disruptionMode field of a composite group or template.
 * @returns 'Single', 'All', or undefined when no mode is set.
 */
export function getCompositeDisruptionMode(
  mode: PodGroupDisruptionMode | undefined
): 'Single' | 'All' | undefined {
  if (mode?.single) {
    return 'Single';
  }
  if (mode?.all) {
    return 'All';
  }
  return undefined;
}

class CompositePodGroup extends KubeObject<KubeCompositePodGroup> {
  static kind = 'CompositePodGroup';
  static apiName = 'compositepodgroups';
  /**
   * Only v1alpha3 serves this resource. v1beta1 serves the composite templates within a
   * Workload, but not the groups they are instantiated into.
   */
  static apiVersion = ['scheduling.k8s.io/v1alpha3'];
  static isNamespaced = true;

  /**
   * Whether the cluster serves this resource, which requires the CompositePodGroup
   * feature gate to be enabled on top of the ones the flat scheduling APIs need.
   * @param cluster - The cluster to check.
   * @returns true when the CompositePodGroup resource is served.
   */
  static isEnabled(cluster: string): Promise<boolean> {
    return isSchedulingResourceServed(
      cluster,
      CompositePodGroup.apiVersion,
      CompositePodGroup.apiName
    );
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

  /** Child groups that must be schedulable together, when the gang policy is used. */
  get minGroupCount(): number | undefined {
    return this.spec?.schedulingPolicy?.gang?.minGroupCount;
  }

  /** Name of the Workload this group was templated from, if any. */
  get workloadName(): string | undefined {
    return this.spec?.workloadRef?.workloadName;
  }

  /** Name of the template within the Workload this group was created from, if any. */
  get compositePodGroupTemplateName(): string | undefined {
    return this.spec?.workloadRef?.templateName;
  }

  /** The composite group this one is nested in, when it is not a hierarchy root. */
  get parentCompositePodGroupName(): string | undefined {
    return this.spec?.parentCompositePodGroupName;
  }

  /** Whether a disruption affects one child group at a time, or the whole composite. */
  get disruptionMode(): 'Single' | 'All' | undefined {
    return getCompositeDisruptionMode(this.spec?.disruptionMode);
  }

  get schedulingCondition(): KubeCondition | undefined {
    return this.status?.conditions?.find(
      condition => condition.type === COMPOSITE_POD_GROUP_INITIALLY_SCHEDULED_CONDITION
    );
  }
}

export default CompositePodGroup;
