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

import { KubeObject, type KubeObjectInterface } from './KubeObject';

/**
 * BackendTrafficPolicyTargetRef defines a backend object that the policy applies to
 * (Service, ServiceImport, or implementation‑specific backendRef).
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/backendtrafficpolicy}
 */
export interface BackendTrafficPolicyTargetRef {
  group: string;
  kind: string;
  name: string;
  sectionName?: string;
}

/**
 * BudgetDetails limits the share of active requests that may be retries and
 * the time window for calculating that budget.
 */
export interface BudgetDetails {
  /** Maximum percentage of concurrent requests that may be retries (0‑100). */
  percent?: number;
  /** Duration string (e.g. "10s") defining the budget interval. */
  interval?: string;
}

/**
 * RequestRate expresses “X requests per Y time‑interval”.
 */
export interface RequestRate {
  /** Number of requests allowed within the interval. */
  count?: number;
  /** Duration string (e.g. "1s") that forms the divisor of the rate. */
  interval?: string;
}

/**
 * RetryConstraint dynamically constrains client‑side retries using a
 * percentage‑based budget and a safety‑net minimum rate.
 */
export interface RetryConstraint {
  budget?: BudgetDetails;
  minRetryRate?: RequestRate;
}

/**
 * SessionPersistence keeps successive requests from the same client on a
 * consistent backend.  The exact shape is still evolving in the spec, so this
 * is typed loosely for now.
 */
export interface SessionPersistence {
  [key: string]: any;
}

/**
 * BackendTrafficPolicySpec defines the desired policy.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/backendtrafficpolicy/#spec}
 */
export interface BackendTrafficPolicySpec {
  targetRefs: BackendTrafficPolicyTargetRef[];
  retryConstraint?: RetryConstraint;
  sessionPersistence?: SessionPersistence;
  /** Allow custom vendor extensions until the API stabilises. */
  [key: string]: any;
}

/**
 * KubeBackendTrafficPolicy is the concrete Kubernetes resource interface.
 */
export interface KubeBackendTrafficPolicy extends KubeObjectInterface {
  spec: BackendTrafficPolicySpec;
}

/**
 * XBackendTrafficPolicy – Gateway API experimental resource that controls
 * client behaviour (retries, session stickiness, etc.) when talking to a
 * backend.
 */
class BackendTrafficPolicy extends KubeObject<KubeBackendTrafficPolicy> {
  static kind = 'XBackendTrafficPolicy';
  static apiName = 'xbackendtrafficpolicies';
  static apiVersion = ['gateway.networking.x-k8s.io/v1alpha1'];
  static isNamespaced = true;

  get spec(): BackendTrafficPolicySpec {
    return this.jsonData.spec;
  }

  get targetRefs(): BackendTrafficPolicyTargetRef[] {
    return this.spec?.targetRefs ?? [];
  }

  get retryConstraint(): RetryConstraint | undefined {
    return this.spec?.retryConstraint;
  }

  get sessionPersistence(): SessionPersistence | undefined {
    return this.spec?.sessionPersistence;
  }

  static get pluralName() {
    return 'xbackendtrafficpolicies';
  }
}

export default BackendTrafficPolicy;
