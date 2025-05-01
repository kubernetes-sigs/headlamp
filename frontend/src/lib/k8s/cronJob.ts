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

import { KubeContainer } from './cluster';
import { KubeMetadata } from './KubeMetadata';
import { KubeObject, KubeObjectInterface } from './KubeObject';

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
    startingDeadlineSeconds?: number;
    successfulJobsHistoryLimit: number;
    failedJobsHistoryLimit: number;
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
}

export default CronJob;
