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
import { isResourceServed } from './resourceAvailability';

/** Matches one PEM certificate block, so a bundle can be shown one certificate at a time. */
const PEM_CERTIFICATE = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

export interface ClusterTrustBundleSpec {
  /**
   * The signer this bundle carries roots for. Unset on a bundle that is not tied to a
   * signer, which anyone may read and which has no name constraints.
   */
  signerName?: string;
  /** One or more X.509 certificates, PEM encoded and concatenated. */
  trustBundle: string;
}

export interface KubeClusterTrustBundle extends KubeObjectInterface {
  spec: ClusterTrustBundleSpec;
}

class ClusterTrustBundle extends KubeObject<KubeClusterTrustBundle> {
  static kind = 'ClusterTrustBundle';
  static apiName = 'clustertrustbundles';
  /**
   * Newest first: the resource is served by v1beta1 behind the ClusterTrustBundle
   * feature gate, and the endpoint falls back to it when a cluster has no v1 yet.
   */
  static apiVersion = ['certificates.k8s.io/v1', 'certificates.k8s.io/v1beta1'];
  static isNamespaced = false;

  /**
   * A new bundle for the create form.
   *
   * Applying a manifest resolves its endpoint from the apiVersion that manifest
   * carries, with no fallback across the versions declared above, so the template
   * has to name a version the cluster serves rather than the newest one known.
   * That is v1beta1, which is where the feature gate serves the resource.
   */
  static getBaseObject(): KubeClusterTrustBundle {
    const baseObject = super.getBaseObject() as KubeClusterTrustBundle;
    baseObject.apiVersion = 'certificates.k8s.io/v1beta1';
    baseObject.spec = { trustBundle: '' };
    return baseObject;
  }

  /**
   * Whether the cluster serves trust bundles, which needs the ClusterTrustBundle
   * feature gate on top of a recent enough Kubernetes.
   * @param cluster - The cluster to check.
   * @returns true when the ClusterTrustBundle resource is served.
   */
  static isEnabled(cluster: string): Promise<boolean> {
    return isResourceServed(cluster, ClusterTrustBundle.apiVersion, ClusterTrustBundle.apiName);
  }

  get spec() {
    return this.jsonData.spec;
  }

  /** The signer this bundle belongs to, when it is tied to one. */
  get signerName(): string {
    return this.spec?.signerName ?? '';
  }

  /**
   * A signed bundle is named `<signer-namespace>:<signer-name>:<suffix>`, so reading it
   * as a signer bundle is what tells the two kinds of bundle apart.
   */
  get isSigned(): boolean {
    return !!this.spec?.signerName;
  }

  /**
   * The bundle split into its individual certificates. The field holds them
   * concatenated, which is unreadable as one blob once a bundle carries more than a
   * couple of roots.
   */
  get certificates(): string[] {
    return this.spec?.trustBundle?.match(PEM_CERTIFICATE) ?? [];
  }

  /** How many certificates the bundle carries. */
  get certificateCount(): number {
    return this.certificates.length;
  }
}

export default ClusterTrustBundle;
