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
import type { KubeRuleWithOperations } from './mutatingWebhookConfiguration';

/** NamedRuleWithOperations extends RuleWithOperations with optional resourceNames. */
export interface KubeNamedRuleWithOperations extends KubeRuleWithOperations {
  resourceNames?: string[];
}

export interface KubeValidatingAdmissionPolicy extends KubeObjectInterface {
  spec: {
    paramKind?: {
      apiVersion: string;
      kind: string;
    };
    matchConstraints: {
      matchPolicy?: string;
      namespaceSelector?: LabelSelector;
      objectSelector?: LabelSelector;
      resourceRules?: KubeNamedRuleWithOperations[];
      excludeResourceRules?: KubeNamedRuleWithOperations[];
    };
    validations?: {
      expression: string;
      message?: string;
      reason?: string;
      messageExpression?: string;
    }[];
    auditAnnotations?: {
      key: string;
      valueExpression: string;
    }[];
    matchConditions?: {
      name: string;
      expression: string;
    }[];
    variables?: {
      name: string;
      expression: string;
    }[];
    failurePolicy?: string;
  };
  status?: {
    typeChecking?: {
      expressionWarnings?: {
        fieldRef: string;
        warning: string;
      }[];
    };
    conditions?: {
      type: string;
      status: string;
      lastTransitionTime?: string;
      reason?: string;
      message?: string;
    }[];
    observedGeneration?: number;
  };
}

class ValidatingAdmissionPolicy extends KubeObject<KubeValidatingAdmissionPolicy> {
  static kind = 'ValidatingAdmissionPolicy';
  static apiName = 'validatingadmissionpolicies';
  static apiVersion = ['admissionregistration.k8s.io/v1', 'admissionregistration.k8s.io/v1beta1'];
  static isNamespaced = false;

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }
}

export default ValidatingAdmissionPolicy;
