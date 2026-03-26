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

import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface KubeAPIService extends KubeObjectInterface {
  spec: {
    group: string;
    version: string;
    service?: {
      name: string;
      namespace: string;
      port?: number;
    };
    groupPriorityMinimum: number;
    versionPriority: number;
    [otherProps: string]: any;
  };
  status: {
    conditions: {
      type: string;
      status: string;
      lastTransitionTime: string;
      reason: string;
      message: string;
    }[];
  };
}

class APIService extends KubeObject<KubeAPIService> {
  static kind = 'APIService';
  static apiName = 'apiservices';
  static apiVersion = 'apiregistration.k8s.io/v1';
  static isNamespaced = false;

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  get isAvailable() {
    const availableCondition = this.status?.conditions?.find(c => c.type === 'Available');
    return availableCondition?.status as 'True' | 'False' | 'Unknown' | undefined;
  }
}

export default APIService;
