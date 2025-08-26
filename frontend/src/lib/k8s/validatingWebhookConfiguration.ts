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
import type {
  KubeRuleWithOperations,
  KubeWebhookClientConfig,
} from './mutatingWebhookConfiguration';

export interface KubeValidatingWebhookConfiguration extends KubeObjectInterface {
  webhooks: {
    admissionReviewVersions: string[];
    clientConfig: KubeWebhookClientConfig;
    failurePolicy?: string;
    matchPolicy?: string;
    name: string;
    namespaceSelector?: {
      matchExpressions: LabelSelector['matchExpressions'];
      matchLabels: LabelSelector['matchLabels'];
    };
    objectSelector?: {
      matchExpressions: LabelSelector['matchExpressions'];
      matchLabels: LabelSelector['matchLabels'];
    };
    rules?: KubeRuleWithOperations[];
    sideEffects?: string;
    timeoutSeconds?: number;
  }[];
}

class ValidatingWebhookConfiguration extends KubeObject<KubeValidatingWebhookConfiguration> {
  static kind = 'ValidatingWebhookConfiguration';
  static apiName = 'validatingwebhookconfigurations';
  static apiVersion = 'admissionregistration.k8s.io/v1';
  static isNamespaced = false;

  static getBaseObject(): KubeValidatingWebhookConfiguration {
    const baseObject = super.getBaseObject() as KubeValidatingWebhookConfiguration;
    baseObject.webhooks = [
      {
        admissionReviewVersions: [],
        clientConfig: {
          caBundle: '',
          service: {
            name: '',
            namespace: '',
          },
        },
        name: '',
        rules: [
          {
            apiGroups: [],
            apiVersions: [],
            operations: [],
            resources: [],
          },
        ],
      },
    ];
    return baseObject;
  }

  get webhooks(): KubeValidatingWebhookConfiguration['webhooks'] {
    return this.jsonData.webhooks;
  }
}

export default ValidatingWebhookConfiguration;
