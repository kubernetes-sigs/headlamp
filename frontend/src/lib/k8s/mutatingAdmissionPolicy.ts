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

import type { KubeCondition } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import type { KubeRuleWithOperations } from './mutatingWebhookConfiguration';

export interface KubeMutatingAdmissionPolicy extends KubeObjectInterface {
  spec: {
    failurePolicy?: string;
    matchConditions?: {
      name: string;
      expression: string;
    }[];
    matchConstraints?: {
      excludeResourceRules?: KubeRuleWithOperations[];
      resourceRules?: KubeRuleWithOperations[];
    };
    mutations?: {
      applyConfiguration?: {
        expression: string;
      };
      jsonPatch?: {
        expression: string;
      };
      patchType: string;
    }[];
    paramKind?: {
      apiVersion?: string;
      kind?: string;
    };
    reinvocationPolicy?: string;
  };
  status?: {
    conditions?: KubeCondition[];
    observedGeneration?: number;
    typeChecking?: {
      expressionWarnings?: {
        fieldRef: string;
        warning: string;
      }[];
    };
  };
}

class MutatingAdmissionPolicy extends KubeObject<KubeMutatingAdmissionPolicy> {
  static kind = 'MutatingAdmissionPolicy';
  static apiName = 'mutatingadmissionpolicies';
  static apiVersion = [
    'admissionregistration.k8s.io/v1beta1',
    'admissionregistration.k8s.io/v1alpha1',
  ];
  static isNamespaced = false;

  static getBaseObject(): KubeMutatingAdmissionPolicy {
    const baseObject = super.getBaseObject() as KubeMutatingAdmissionPolicy;
    baseObject.spec = {
      failurePolicy: 'Fail',
      matchConstraints: {
        resourceRules: [
          {
            apiGroups: [],
            apiVersions: [],
            operations: [],
            resources: [],
          },
        ],
      },
      mutations: [
        {
          patchType: 'ApplyConfiguration',
          applyConfiguration: {
            expression: '',
          },
        },
      ],
    };
    return baseObject;
  }

  get spec(): KubeMutatingAdmissionPolicy['spec'] {
    return this.jsonData.spec;
  }
}

export default MutatingAdmissionPolicy;
