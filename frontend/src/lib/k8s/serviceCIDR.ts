/*
 * Copyright 2026 The Kubernetes Authors
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

import type { BaseCondition } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import { isResourceServed } from './resourceAvailability';

export interface KubeServiceCIDR extends KubeObjectInterface {
  spec?: { cidrs?: string[] };
  status?: { conditions?: BaseCondition[] };
}

class ServiceCIDR extends KubeObject<KubeServiceCIDR> {
  static kind = 'ServiceCIDR';
  static apiName = 'servicecidrs';
  static apiVersion = 'networking.k8s.io/v1';
  static isNamespaced = false;

  static isEnabled(cluster: string): Promise<boolean> {
    return isResourceServed(cluster, this.apiVersion, this.apiName);
  }

  static getBaseObject() {
    return { ...super.getBaseObject(), spec: { cidrs: [] as string[] } };
  }

  get cidrs(): string[] {
    return this.jsonData.spec?.cidrs ?? [];
  }

  get readyCondition(): BaseCondition | undefined {
    return this.jsonData.status?.conditions?.find(condition => condition.type === 'Ready');
  }
}

export default ServiceCIDR;
