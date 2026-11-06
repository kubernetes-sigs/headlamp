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
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import type {
  CertificateSigningRequestCondition,
  KubeCertificateSigningRequest,
} from './certificateSigningRequest';
import CertificateSigningRequest from './certificateSigningRequest';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const REQUEST_PEM =
  '-----BEGIN CERTIFICATE REQUEST-----\nMIIBogIBADAP\n-----END CERTIFICATE REQUEST-----';
const CERTIFICATE_PEM = '-----BEGIN CERTIFICATE-----\nMIIDATCCAemgAw\n-----END CERTIFICATE-----';

const makeCSR = (
  conditions?: CertificateSigningRequestCondition[],
  certificate?: string,
  spec: Partial<KubeCertificateSigningRequest['spec']> = {}
) =>
  new CertificateSigningRequest({
    kind: 'CertificateSigningRequest',
    apiVersion: 'certificates.k8s.io/v1',
    metadata: {
      name: 'csr-node-1',
      uid: 'csr-uid',
      creationTimestamp: '2026-09-20T15:00:00Z',
    },
    spec: {
      request: Base64.encode(REQUEST_PEM),
      signerName: 'kubernetes.io/kubelet-serving',
      username: 'system:node:node-1',
      groups: ['system:nodes', 'system:authenticated'],
      usages: ['digital signature', 'server auth'],
      ...spec,
    },
    status: { conditions, certificate },
  } as KubeCertificateSigningRequest);

const condition = (type: string, status = 'True'): CertificateSigningRequestCondition => ({
  type,
  status,
  lastUpdateTime: '2026-09-20T15:01:00Z',
});

describe('CertificateSigningRequest', () => {
  it('is a cluster scoped certificates.k8s.io resource', () => {
    expect(CertificateSigningRequest.apiVersion).toBe('certificates.k8s.io/v1');
    expect(CertificateSigningRequest.apiName).toBe('certificatesigningrequests');
    expect(CertificateSigningRequest.isNamespaced).toBe(false);
    expect(CertificateSigningRequest.apiGroupName).toBe('certificates.k8s.io');
  });

  it('reads the signer, requestor, groups and usages off the spec', () => {
    const csr = makeCSR();

    expect(csr.signerName).toBe('kubernetes.io/kubelet-serving');
    expect(csr.requestor).toBe('system:node:node-1');
    expect(csr.groups).toEqual(['system:nodes', 'system:authenticated']);
    expect(csr.usages).toEqual(['digital signature', 'server auth']);
  });

  describe('state', () => {
    it('is Pending while neither approved nor denied', () => {
      expect(makeCSR().state).toBe('Pending');
      expect(makeCSR([]).state).toBe('Pending');
    });

    it('is Approved once approved but before a certificate exists', () => {
      expect(makeCSR([condition('Approved')]).state).toBe('Approved');
    });

    it('is Issued once the signer has produced a certificate', () => {
      const csr = makeCSR([condition('Approved')], Base64.encode(CERTIFICATE_PEM));

      expect(csr.state).toBe('Issued');
      expect(csr.isIssued).toBe(true);
    });

    it('is Denied for a denied request', () => {
      expect(makeCSR([condition('Denied')]).state).toBe('Denied');
    });

    it('reports Failed ahead of approval, since the signer could not issue', () => {
      const csr = makeCSR([condition('Approved'), condition('Failed')]);

      expect(csr.state).toBe('Failed');
    });

    it('ignores conditions that are present but not true', () => {
      expect(makeCSR([condition('Approved', 'False')]).state).toBe('Pending');
    });
  });

  describe('PEM decoding', () => {
    it('decodes the request and the issued certificate', () => {
      const csr = makeCSR([condition('Approved')], Base64.encode(CERTIFICATE_PEM));

      expect(csr.requestPEM).toBe(REQUEST_PEM);
      expect(csr.certificatePEM).toBe(CERTIFICATE_PEM);
    });

    it('is empty when no certificate has been issued yet', () => {
      expect(makeCSR().certificatePEM).toBe('');
    });

    it('falls back to empty text when a field does not decode', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const decode = vi.spyOn(Base64, 'decode').mockImplementation(() => {
        throw new Error('not base64');
      });

      expect(makeCSR().requestPEM).toBe('');

      decode.mockRestore();
      warn.mockRestore();
    });
  });
});
