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
import type { WorkloadHealthCategory } from './Workload';

export interface KubeJobSet extends KubeObjectInterface {
  spec: {
    [otherProps: string]: any;
  };
  status: {
    conditions?: {
      type: string;
      status: string;
      [otherProps: string]: any;
    }[];
    [otherProps: string]: any;
  };
}

class JobSet extends KubeObject<KubeJobSet> {
  static kind = 'JobSet';
  static apiName = 'jobsets';
  static apiVersion = 'jobset.x-k8s.io/v1alpha2';
  static isNamespaced = true;

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  /**
   * Classifies the job set into a coarse health category for the Workloads
   * overview chart. Job sets have no replica fields, so the replica-mismatch
   * logic used for other workloads can't apply. This relies on the same
   * conditions the Job Sets list shows (Failed / Completed / Suspended); a job
   * set with no terminal condition yet is still running and treated as
   * transitional.
   */
  getHealth(): WorkloadHealthCategory {
    const conditions = this.status?.conditions || [];
    const isTrue = (type: string) => conditions.some(c => c.type === type && c.status === 'True');

    if (isTrue('Failed')) {
      return 'failed';
    }
    if (isTrue('Completed')) {
      return 'healthy';
    }
    if (isTrue('Suspended')) {
      return 'degraded';
    }
    return 'transitional';
  }

  static getBaseObject(): KubeJobSet {
    const baseObject = super.getBaseObject() as KubeJobSet;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
      labels: { app: 'headlamp' },
    };
    baseObject.spec = {
      replicatedJobs: [
        {
          name: 'workers',
          replicas: 1,
          template: {
            spec: {
              parallelism: 1,
              completions: 1,
              template: {
                spec: {
                  containers: [
                    {
                      name: '',
                      image: '',
                      command: [],
                      imagePullPolicy: 'Always',
                    },
                  ],
                  restartPolicy: 'Never',
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

export default JobSet;
