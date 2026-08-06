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

import type { LabelSelector } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

export interface KubeMatchResources {
  excludeResourceRules?: KubeResourceRule[];
  matchPolicy?: string;
  namespaceSelector?: LabelSelector;
  objectSelector?: LabelSelector;
  resourceRules?: KubeResourceRule[];
}

export interface KubeResourceRule {
  apiGroups: string[];
  apiVersions: string[];
  operations: string[];
  resourceNames?: string[];
  resources: string[];
  scope?: string;
}

export interface KubeValidatingAdmissionPolicy extends KubeObjectInterface {
  spec: {
    auditAnnotations?: {
      key: string;
      valueExpression: string;
    }[];
    failurePolicy?: string;
    matchConditions?: {
      name: string;
      expression: string;
    }[];
    matchConstraints?: KubeMatchResources;
    paramKind?: {
      apiVersion?: string;
      kind?: string;
    };
    validations?: {
      expression: string;
      message?: string;
      messageExpression?: string;
      reason?: string;
    }[];
    variables?: {
      name: string;
      expression: string;
    }[];
  };
}

class ValidatingAdmissionPolicy extends KubeObject<KubeValidatingAdmissionPolicy> {
  static kind = 'ValidatingAdmissionPolicy';
  static apiName = 'validatingadmissionpolicies';
  static apiVersion = 'admissionregistration.k8s.io/v1';
  static isNamespaced = false;

  get spec(): KubeValidatingAdmissionPolicy['spec'] {
    return this.jsonData.spec;
  }
}

export default ValidatingAdmissionPolicy;
