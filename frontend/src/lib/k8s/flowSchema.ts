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

import type { BaseCondition } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import { isResourceServed } from './resourceAvailability';

/** Condition the apiserver sets when the priority level a schema names is missing. */
export const FLOW_SCHEMA_DANGLING_CONDITION = 'Dangling';

/** Who a rule applies to. Exactly one of the three bodies is set, matching `kind`. */
export interface FlowSchemaSubject {
  kind: string;
  user?: { name: string };
  group?: { name: string };
  serviceAccount?: { name: string; namespace: string };
}

export interface FlowSchemaResourceRule {
  verbs: string[];
  apiGroups: string[];
  resources: string[];
  namespaces?: string[];
  clusterScope?: boolean;
}

export interface FlowSchemaNonResourceRule {
  verbs: string[];
  nonResourceURLs: string[];
}

export interface FlowSchemaPolicyRule {
  subjects: FlowSchemaSubject[];
  resourceRules?: FlowSchemaResourceRule[];
  nonResourceRules?: FlowSchemaNonResourceRule[];
}

export interface FlowSchemaSpec {
  /** The priority level requests matching this schema are assigned to. */
  priorityLevelConfiguration: { name: string };
  /** Lower wins: the schema with the smallest value that matches is the one used. */
  matchingPrecedence?: number;
  /** How matching requests are split into flows. Absent means every request shares one. */
  distinguisherMethod?: { type: string };
  rules?: FlowSchemaPolicyRule[];
}

export interface KubeFlowSchema extends KubeObjectInterface {
  spec: FlowSchemaSpec;
  status?: { conditions?: BaseCondition[] };
}

class FlowSchema extends KubeObject<KubeFlowSchema> {
  static kind = 'FlowSchema';
  static apiName = 'flowschemas';
  static apiVersion = 'flowcontrol.apiserver.k8s.io/v1';
  static isNamespaced = false;

  static isEnabled(cluster: string): Promise<boolean> {
    return isResourceServed(cluster, this.apiVersion, this.apiName);
  }

  static getBaseObject() {
    return {
      ...super.getBaseObject(),
      spec: { priorityLevelConfiguration: { name: '' }, matchingPrecedence: 1000, rules: [] },
    };
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  /** The priority level this schema sends matching requests to. */
  get priorityLevelName(): string {
    return this.spec?.priorityLevelConfiguration?.name ?? '';
  }

  get matchingPrecedence(): number | undefined {
    return this.spec?.matchingPrecedence;
  }

  /** How flows are distinguished, or undefined when every request shares one flow. */
  get distinguisherMethod(): string | undefined {
    return this.spec?.distinguisherMethod?.type;
  }

  get rules(): FlowSchemaPolicyRule[] {
    return this.spec?.rules ?? [];
  }

  get danglingCondition(): BaseCondition | undefined {
    return this.status?.conditions?.find(
      condition => condition.type === FLOW_SCHEMA_DANGLING_CONDITION
    );
  }

  /** Whether the API server reports an invalid priority level reference. */
  get isDangling(): boolean {
    return this.danglingCondition?.status === 'True';
  }
}

export default FlowSchema;
