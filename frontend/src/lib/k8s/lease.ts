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

export interface LeaseSpec {
  holderIdentity: string;
  leaseDurationSeconds: number;
  leaseTransitions: number;
  renewTime: string;
}

export interface KubeLease extends KubeObjectInterface {
  spec: LeaseSpec;
}

export class Lease extends KubeObject<KubeLease> {
  static kind = 'Lease';
  static apiName = 'leases';
  static apiVersion = 'coordination.k8s.io/v1';
  static isNamespaced = true;

  static getBaseObject(): KubeLease {
    const baseObject = super.getBaseObject() as KubeLease;
    baseObject.spec = {
      holderIdentity: '',
      leaseDurationSeconds: 0,
      leaseTransitions: 0,
      renewTime: '',
    };
    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }
}
