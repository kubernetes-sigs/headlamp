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

import { Base64 } from 'js-base64';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

/**
 * A condition on a signing request. Unlike most Kubernetes conditions these carry a
 * lastUpdateTime as well, and only one of Approved or Denied may ever be set.
 */
export interface CertificateSigningRequestCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastUpdateTime?: string;
  lastTransitionTime?: string;
}

export interface CertificateSigningRequestSpec {
  /** The PKCS#10 certificate request, PEM encoded and then base64 encoded. */
  request: string;
  /** Who is being asked to sign, e.g. kubernetes.io/kube-apiserver-client. */
  signerName: string;
  /** Requested lifetime of the certificate. The signer may issue a shorter one. */
  expirationSeconds?: number;
  usages?: string[];
  /** The user that created the request, filled in by the API server. */
  username?: string;
  uid?: string;
  groups?: string[];
  extra?: Record<string, string[]>;
}

export interface KubeCertificateSigningRequest extends KubeObjectInterface {
  spec: CertificateSigningRequestSpec;
  status?: {
    conditions?: CertificateSigningRequestCondition[];
    /** The issued certificate, PEM encoded and then base64 encoded. */
    certificate?: string;
  };
}

/**
 * What a request is waiting for or what happened to it. Kubernetes reports this as a
 * set of conditions plus a certificate field, which is what kubectl folds into the
 * single CONDITION column.
 */
export type CertificateSigningRequestState =
  | 'Pending'
  | 'Approved'
  | 'Denied'
  | 'Failed'
  | 'Issued';

class CertificateSigningRequest extends KubeObject<KubeCertificateSigningRequest> {
  static kind = 'CertificateSigningRequest';
  static apiName = 'certificatesigningrequests';
  static apiVersion = 'certificates.k8s.io/v1';
  static isNamespaced = false;

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  get conditions(): CertificateSigningRequestCondition[] {
    return this.status?.conditions ?? [];
  }

  /** Whether a condition of this type is present and true. */
  private hasCondition(type: string): boolean {
    return this.conditions.some(
      condition => condition.type === type && condition.status === 'True'
    );
  }

  /**
   * The state kubectl shows: a signer that could not issue reports Failed, a denied
   * request stays denied, and an approved one only becomes Issued once a certificate
   * has actually been signed.
   */
  get state(): CertificateSigningRequestState {
    if (this.hasCondition('Failed')) {
      return 'Failed';
    }
    if (this.hasCondition('Denied')) {
      return 'Denied';
    }
    if (this.hasCondition('Approved')) {
      return this.isIssued ? 'Issued' : 'Approved';
    }
    return 'Pending';
  }

  get signerName(): string {
    return this.spec?.signerName ?? '';
  }

  /** The user that asked for the certificate. */
  get requestor(): string {
    return this.spec?.username ?? '';
  }

  get groups(): string[] {
    return this.spec?.groups ?? [];
  }

  get usages(): string[] {
    return this.spec?.usages ?? [];
  }

  get expirationSeconds(): number | undefined {
    return this.spec?.expirationSeconds;
  }

  get isIssued(): boolean {
    return !!this.status?.certificate;
  }

  /**
   * The request as PEM text. The field is base64 on the wire; a request that does not
   * decode is shown as empty rather than breaking the details view.
   */
  get requestPEM(): string {
    return decodeBase64(this.spec?.request);
  }

  /** The issued certificate as PEM text, once a signer has produced one. */
  get certificatePEM(): string {
    return decodeBase64(this.status?.certificate);
  }
}

function decodeBase64(value: string | undefined): string {
  if (!value) {
    return '';
  }

  try {
    return Base64.decode(value);
  } catch (error) {
    console.warn('Failed to decode a certificate signing request field:', error);
    return '';
  }
}

export default CertificateSigningRequest;
