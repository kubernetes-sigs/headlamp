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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import type { KubeClusterTrustBundle } from './clusterTrustBundle';
import ClusterTrustBundle from './clusterTrustBundle';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  request: mockRequest,
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const certificate = (body: string) =>
  `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;

const makeBundle = (spec: KubeClusterTrustBundle['spec']) =>
  new ClusterTrustBundle({
    kind: 'ClusterTrustBundle',
    apiVersion: 'certificates.k8s.io/v1beta1',
    metadata: {
      name: 'example.com:my-signer:roots',
      uid: 'ctb-uid',
      creationTimestamp: '2026-09-20T15:00:00Z',
    },
    spec,
  } as KubeClusterTrustBundle);

describe('ClusterTrustBundle', () => {
  it('is a cluster scoped certificates.k8s.io resource', () => {
    expect(ClusterTrustBundle.apiName).toBe('clustertrustbundles');
    expect(ClusterTrustBundle.isNamespaced).toBe(false);
    expect(ClusterTrustBundle.apiGroupName).toBe('certificates.k8s.io');
  });

  it('templates a new bundle under the version a cluster serves', () => {
    const baseObject = ClusterTrustBundle.getBaseObject();

    expect(baseObject.apiVersion).toBe('certificates.k8s.io/v1beta1');
    expect(baseObject.kind).toBe('ClusterTrustBundle');
    expect(baseObject.spec).toEqual({ trustBundle: '' });
  });

  describe('signer', () => {
    it('reads the signer name when the bundle is tied to one', () => {
      const bundle = makeBundle({
        signerName: 'example.com/my-signer',
        trustBundle: certificate('AAAA'),
      });

      expect(bundle.signerName).toBe('example.com/my-signer');
      expect(bundle.isSigned).toBe(true);
    });

    it('treats a bundle with no signer as unsigned', () => {
      const bundle = makeBundle({ trustBundle: certificate('AAAA') });

      expect(bundle.signerName).toBe('');
      expect(bundle.isSigned).toBe(false);
    });
  });

  describe('certificates', () => {
    it('splits a bundle into its individual certificates', () => {
      const first = certificate('FIRST');
      const second = certificate('SECOND');
      const bundle = makeBundle({ trustBundle: `${first}\n${second}\n` });

      expect(bundle.certificates).toEqual([first, second]);
      expect(bundle.certificateCount).toBe(2);
    });

    it('keeps a single certificate as one entry', () => {
      expect(makeBundle({ trustBundle: certificate('ONLY') }).certificateCount).toBe(1);
    });

    it('reports nothing for an empty or malformed bundle', () => {
      expect(makeBundle({ trustBundle: '' }).certificates).toEqual([]);
      expect(makeBundle({ trustBundle: 'not a certificate' }).certificates).toEqual([]);
      expect(makeBundle({ trustBundle: '' }).certificateCount).toBe(0);
    });
  });

  describe('isEnabled', () => {
    beforeEach(() => {
      mockRequest.mockReset();
    });

    it.each([[['stable', 'beta']], [['beta', 'stable']]])(
      'selects only clusters serving the template version in order %j',
      async clusters => {
        mockRequest.mockImplementation(async (path, { cluster }) => ({
          resources:
            path === '/apis/certificates.k8s.io/' + (cluster === 'beta' ? 'v1beta1' : 'v1')
              ? [{ name: 'clustertrustbundles' }]
              : [],
        }));
        const served = await Promise.all(
          clusters.map(cluster => ClusterTrustBundle.isEnabled(cluster))
        );
        expect(clusters.filter((_, index) => served[index])).toEqual(['beta']);
      }
    );

    it('is false when the feature gate is off, so the cluster does not serve it', async () => {
      mockRequest.mockResolvedValue({ resources: [{ name: 'certificatesigningrequests' }] });

      expect(await ClusterTrustBundle.isEnabled('legacy')).toBe(false);
    });
  });
});
