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

import { isConditionTrue } from './conditions';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import type { WorkloadHealthCategory } from './Workload';

/**
 * Label the disaggregated set controller stamps on every child resource (such as
 * leader worker sets) it creates for a disaggregated set, set to the disaggregated
 * set's name.
 */
export const DISAGGREGATED_SET_NAME_LABEL = 'disaggregatedset.x-k8s.io/name';
export const DISAGGREGATED_SET_ROLE_LABEL = 'disaggregatedset.x-k8s.io/role';
export const DISAGGREGATED_SET_SLICE_LABEL = 'disaggregatedset.x-k8s.io/slice';

export interface DisaggregatedRoleSpec {
  name: string;
  spec?: {
    replicas?: number;
    leaderWorkerTemplate?: {
      size?: number;
      [otherProps: string]: any;
    };
    [otherProps: string]: any;
  };
  leaderWorkerTemplate?: {
    size?: number;
    [otherProps: string]: any;
  };
  [otherProps: string]: any;
}

export interface KubeDisaggregatedSet extends KubeObjectInterface {
  spec: {
    slices?: number;
    replicas?: number;
    roles?: DisaggregatedRoleSpec[];
    [otherProps: string]: any;
  };
  status?: {
    slices?: number;
    readySlices?: number;
    replicas?: number;
    readyReplicas?: number;
    updatedReplicas?: number;
    conditions?: {
      type: string;
      status: string;
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
      [otherProps: string]: any;
    }[];
    [otherProps: string]: any;
  };
}

class DisaggregatedSet extends KubeObject<KubeDisaggregatedSet> {
  static kind = 'DisaggregatedSet';
  static apiName = 'disaggregatedsets';
  static apiVersion = 'disaggregatedset.x-k8s.io/v1';
  static isNamespaced = true;

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  /**
   * Number of slices or replicas the disaggregated set is asked to run.
   *
   * The CRD defaults `slices` (or `replicas`) to 1, so an object read from a cluster
   * usually has it. Mirror that default rather than falling back to 0, which would
   * otherwise read as a deliberate scale to zero.
   */
  getDesiredReplicas(): number {
    return this.spec?.slices ?? this.spec?.replicas ?? 1;
  }

  /** Number of slices/replicas that have all of their roles/groups ready. */
  getReadyReplicas(): number {
    return this.status?.readySlices ?? this.status?.readyReplicas ?? 0;
  }

  /**
   * Classifies the disaggregated set into a coarse health category for the
   * Workloads overview chart.
   */
  getHealth(): WorkloadHealthCategory {
    const conditions = this.status?.conditions;

    if (isConditionTrue(conditions, 'UpdateInProgress')) {
      return 'transitional';
    }

    const desired = this.getDesiredReplicas();
    const ready = this.getReadyReplicas();

    if (desired === 0) {
      return 'healthy';
    }
    if (ready >= desired) {
      return 'healthy';
    }
    if (ready === 0) {
      return isConditionTrue(conditions, 'Progressing') ? 'transitional' : 'failed';
    }
    return 'degraded';
  }

  static getBaseObject(): KubeDisaggregatedSet {
    const baseObject = super.getBaseObject() as KubeDisaggregatedSet;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
      labels: { app: 'headlamp' },
    };
    baseObject.spec = {
      slices: 1,
      roles: [
        {
          name: 'prefill',
          spec: {
            replicas: 1,
            leaderWorkerTemplate: {
              size: 2,
              restartPolicy: 'RecreateGroupOnPodRestart',
              leaderTemplate: {
                spec: {
                  containers: [
                    {
                      name: 'prefill-leader',
                      image: '',
                      command: [],
                      imagePullPolicy: 'Always',
                    },
                  ],
                },
              },
              workerTemplate: {
                spec: {
                  containers: [
                    {
                      name: 'prefill-worker',
                      image: '',
                      command: [],
                      imagePullPolicy: 'Always',
                    },
                  ],
                },
              },
            },
          },
        },
        {
          name: 'decode',
          spec: {
            replicas: 1,
            leaderWorkerTemplate: {
              size: 2,
              restartPolicy: 'RecreateGroupOnPodRestart',
              leaderTemplate: {
                spec: {
                  containers: [
                    {
                      name: 'decode-leader',
                      image: '',
                      command: [],
                      imagePullPolicy: 'Always',
                    },
                  ],
                },
              },
              workerTemplate: {
                spec: {
                  containers: [
                    {
                      name: 'decode-worker',
                      image: '',
                      command: [],
                      imagePullPolicy: 'Always',
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    };
    return baseObject;
  }
}

export default DisaggregatedSet;
