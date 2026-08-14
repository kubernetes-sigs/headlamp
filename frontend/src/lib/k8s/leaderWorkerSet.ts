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
 * Label the leader worker set controller stamps on every stateful set and pod it
 * creates for a leader worker set, set to the leader worker set's name. Owner
 * references can't stand in for it: a group's worker stateful set is owned by
 * that group's leader pod rather than by the leader worker set.
 */
export const LEADER_WORKER_SET_NAME_LABEL = 'leaderworkerset.sigs.k8s.io/name';

export interface KubeLeaderWorkerSet extends KubeObjectInterface {
  spec: {
    replicas?: number;
    [otherProps: string]: any;
  };
  status: {
    replicas?: number;
    readyReplicas?: number;
    updatedReplicas?: number;
    conditions?: {
      type: string;
      status: string;
      [otherProps: string]: any;
    }[];
    [otherProps: string]: any;
  };
}

class LeaderWorkerSet extends KubeObject<KubeLeaderWorkerSet> {
  static kind = 'LeaderWorkerSet';
  static apiName = 'leaderworkersets';
  static apiVersion = 'leaderworkerset.x-k8s.io/v1';
  static isNamespaced = true;

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  /**
   * Number of groups the leader worker set is asked to run.
   *
   * The CRD defaults `replicas` to 1, so an object read from a cluster always
   * has it. Mirror that default rather than falling back to 0, which would
   * otherwise read as a deliberate scale to zero. Every view derives the desired
   * count from here so the list and the Workloads overview can't disagree about
   * an object whose `spec.replicas` is missing.
   */
  getDesiredReplicas(): number {
    return this.spec?.replicas ?? 1;
  }

  /** Number of groups that have all of their pods ready. */
  getReadyReplicas(): number {
    return this.status?.readyReplicas ?? 0;
  }

  /**
   * Classifies the leader worker set into a coarse health category for the
   * Workloads overview chart. Unlike job sets, a leader worker set does have
   * replica fields, so readiness is judged by comparing ready against desired
   * replicas. A group that has been explicitly scaled to zero is treated as
   * healthy rather than failed, since that is the requested state, and one that
   * is still coming up is transitional rather than failed.
   */
  getHealth(): WorkloadHealthCategory {
    const conditions = this.status?.conditions;

    // An in-progress rollout is transitional regardless of the replica counts,
    // which briefly match while pods are being replaced.
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
      // No group is ready yet. While the controller reports progress on creating
      // or scaling groups, that is a workload still coming up rather than a
      // failure, so don't flag a freshly created leader worker set as failed.
      return isConditionTrue(conditions, 'Progressing') ? 'transitional' : 'failed';
    }
    return 'degraded';
  }

  static getBaseObject(): KubeLeaderWorkerSet {
    const baseObject = super.getBaseObject() as KubeLeaderWorkerSet;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
      labels: { app: 'headlamp' },
    };
    baseObject.spec = {
      replicas: 1,
      leaderWorkerTemplate: {
        size: 2,
        restartPolicy: 'RecreateGroupOnPodRestart',
        leaderTemplate: {
          spec: {
            containers: [
              {
                name: '',
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
                name: '',
                image: '',
                command: [],
                imagePullPolicy: 'Always',
              },
            ],
          },
        },
      },
    };
    return baseObject;
  }
}

export default LeaderWorkerSet;
