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
import type { KubeRuleWithOperations } from './mutatingWebhookConfiguration';

export interface KubeMutatingAdmissionPolicyBinding extends KubeObjectInterface {
  spec: {
    matchResources?: {
      excludeResourceRules?: KubeRuleWithOperations[];
      resourceRules?: KubeRuleWithOperations[];
    };
    paramRef?: {
      name?: string;
      namespace?: string;
      parameterNotFoundAction?: string;
      selector?: {
        matchExpressions?: {
          key: string;
          operator: string;
          values?: string[];
        }[];
        matchLabels?: {
          [key: string]: string;
        };
      };
    };
    policyName: string;
  };
}

class MutatingAdmissionPolicyBinding extends KubeObject<KubeMutatingAdmissionPolicyBinding> {
  static kind = 'MutatingAdmissionPolicyBinding';
  static apiName = 'mutatingadmissionpolicybindings';
  static apiVersion = [
    'admissionregistration.k8s.io/v1beta1',
    'admissionregistration.k8s.io/v1alpha1',
  ];
  static isNamespaced = false;

  static getBaseObject(): KubeMutatingAdmissionPolicyBinding {
    const baseObject = super.getBaseObject() as KubeMutatingAdmissionPolicyBinding;
    baseObject.spec = {
      policyName: '',
    };
    return baseObject;
  }

  get spec(): KubeMutatingAdmissionPolicyBinding['spec'] {
    return this.jsonData.spec;
  }
}

export default MutatingAdmissionPolicyBinding;
