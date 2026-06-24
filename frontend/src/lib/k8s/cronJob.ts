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

import type { KubeContainer } from './cluster';
import type { KubeMetadata } from './KubeMetadata';
import { KubeObject, type KubeObjectInterface } from './KubeObject';
import type { WorkloadHealthCategory } from './Workload';

/**
 * CronJob structure returned by the k8s API.
 *
 * @see {@link https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/cron-job-v1/} Kubernetes API reference for CronJob
 *
 * @see {@link https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/} Kubernetes definition for CronJob
 */
export interface KubeCronJob extends KubeObjectInterface {
  spec: {
    suspend: boolean;
    schedule: string;
    timeZone?: string;
    startingDeadlineSeconds?: number;
    successfulJobsHistoryLimit?: number;
    failedJobsHistoryLimit?: number;
    concurrencyPolicy: string;
    jobTemplate: {
      spec: {
        metadata?: Partial<KubeMetadata>;
        template: {
          spec: {
            metadata?: Partial<KubeMetadata>;
            containers: KubeContainer[];
          };
        };
      };
    };
    [otherProps: string]: any;
  };
  status: {
    active?: { name: string }[];
    lastScheduleTime?: string;
    lastSuccessfulTime?: string;
    [otherProps: string]: any;
  };
}

class CronJob extends KubeObject<KubeCronJob> {
  static kind = 'CronJob';
  static apiName = 'cronjobs';
  static apiVersion = 'batch/v1';
  static isNamespaced = true;

  get spec() {
    return this.getValue('spec');
  }

  get status() {
    return this.getValue('status');
  }

  static getBaseObject(): KubeCronJob {
    const baseObject = super.getBaseObject() as KubeCronJob;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
    };
    baseObject.spec = {
      suspend: false,
      schedule: '',
      successfulJobsHistoryLimit: 3,
      failedJobsHistoryLimit: 1,
      concurrencyPolicy: 'Allow',
      jobTemplate: {
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: '',
                  image: '',
                  imagePullPolicy: 'Always',
                },
              ],
            },
          },
        },
      },
    };
    return baseObject;
  }

  getContainers(): KubeContainer[] {
    return this.spec.jobTemplate?.spec?.template?.spec?.containers || [];
  }

  /**
   * Classifies the cron job into a coarse health category for the Workloads
   * overview chart. Cron jobs have no replica fields, so the replica-mismatch
   * logic used for other workloads can't apply. A suspended cron job is
   * degraded, one with running jobs is transitional, and one whose last run was
   * scheduled but never recorded a success is treated as failed.
   */
  getHealth(): WorkloadHealthCategory {
    if (this.spec?.suspend) {
      return 'degraded';
    }
    if ((this.status?.active?.length ?? 0) > 0) {
      return 'transitional';
    }
    const lastSchedule = this.status?.lastScheduleTime;
    const lastSuccess = this.status?.lastSuccessfulTime;
    if (lastSchedule && (!lastSuccess || new Date(lastSchedule) > new Date(lastSuccess))) {
      return 'failed';
    }
    return 'healthy';
  }
}

export default CronJob;
