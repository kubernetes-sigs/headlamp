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

/**
 * BackendTLSPolicyTargetRef defines the target resource (e.g., Service) for the TLS policy.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/backendtlspolicy/#structure}
 */
export interface BackendTLSPolicyTargetRef {
  group: string;
  kind: string;
  name: string;
  sectionName?: string;
}

/**
 * BackendTLSPolicyValidation defines TLS validation settings such as trusted CA and SAN.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/backendtlspolicy/#structure}
 */
export interface BackendTLSPolicyValidation {
  caCertificateRefs: {
    group: string;
    kind: string;
    name: string;
  }[];
  hostname: string;
}

/**
 * BackendTLSPolicySpec defines the policy spec.
 */
export interface BackendTLSPolicySpec {
  targetRefs: BackendTLSPolicyTargetRef[];
  validation: BackendTLSPolicyValidation;
  [key: string]: any;
}

/**
 * BackendTLSPolicy is a Gateway API type that enforces TLS connections from the gateway to the backend.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/backendtlspolicy/}
 */
export interface KubeBackendTLSPolicy extends KubeObjectInterface {
  spec: BackendTLSPolicySpec;
}

class BackendTLSPolicy extends KubeObject<KubeBackendTLSPolicy> {
  static kind = 'BackendTLSPolicy';
  static apiName = 'backendtlspolicies';
  static apiVersion = ['gateway.networking.k8s.io/v1alpha3'];
  static isNamespaced = true;

  get spec(): BackendTLSPolicySpec {
    return this.jsonData.spec;
  }

  get targetRefs(): BackendTLSPolicyTargetRef[] {
    return this.jsonData.spec?.targetRefs ?? [];
  }

  get validation(): BackendTLSPolicyValidation {
    return (
      this.jsonData.spec?.validation ?? {
        caCertificateRefs: [],
        hostname: '',
      }
    );
  }

  static get pluralName() {
    return 'backendtlspolicies';
  }
}

export default BackendTLSPolicy;
