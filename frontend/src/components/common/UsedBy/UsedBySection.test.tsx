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

import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { lightTheme } from '../../../components/App/defaultAppThemes';
import type Pod from '../../../lib/k8s/pod';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import { findPodReferences } from './podReferences';
import UsedBySection from './UsedBySection';

function renderInContext(ui: React.ReactNode) {
  return render(
    <ThemeProvider theme={createMuiTheme(lightTheme)}>
      <TestContext>{ui}</TestContext>
    </ThemeProvider>
  );
}

vi.mock('../../pod/List', () => ({
  makePodStatusLabel: () => 'Running',
}));

const podUseListMock = vi.fn();

vi.mock('../../../lib/k8s/pod', () => ({
  default: {
    useList: (...args: any[]) => podUseListMock(...args),
  },
}));

interface MakePodOptions {
  name?: string;
  namespace?: string;
  spec?: Record<string, any>;
  ownerKind?: string;
  ownerName?: string;
}

function makePod(opts: MakePodOptions = {}): Pod {
  const {
    name = 'pod-a',
    namespace = 'default',
    spec = { containers: [{ name: 'app', image: 'nginx' }] },
    ownerKind,
    ownerName = 'owner',
  } = opts;

  return {
    metadata: {
      name,
      namespace,
      creationTimestamp: '2025-01-01T00:00:00Z',
      uid: `uid-${name}`,
      ownerReferences: ownerKind
        ? [{ kind: ownerKind, name: ownerName, uid: 'owner-uid', controller: true }]
        : undefined,
    },
    spec,
    cluster: 'test',
  } as unknown as Pod;
}

describe('findPodReferences', () => {
  it('returns no references when no Pods reference the resource', () => {
    const pods = [makePod()];
    expect(findPodReferences(pods, 'ConfigMap', 'absent-cm')).toEqual([]);
  });

  it('returns no references when the resource name is empty', () => {
    const pods = [
      makePod({
        spec: {
          containers: [{ name: 'app', image: 'nginx', envFrom: [{ configMapRef: { name: '' } }] }],
        },
      }),
    ];
    expect(findPodReferences(pods, 'ConfigMap', '')).toEqual([]);
  });

  describe('ConfigMap reference paths', () => {
    it('finds env.valueFrom.configMapKeyRef', () => {
      const pod = makePod({
        spec: {
          containers: [
            {
              name: 'app',
              image: 'nginx',
              env: [{ name: 'X', valueFrom: { configMapKeyRef: { name: 'my-cm', key: 'k' } } }],
            },
          ],
        },
      });
      const refs = findPodReferences([pod], 'ConfigMap', 'my-cm');
      expect(refs).toHaveLength(1);
      expect(refs[0].usages).toEqual([{ kind: 'env', container: 'app', isInitOrEphemeral: false }]);
    });

    it('finds envFrom.configMapRef', () => {
      const pod = makePod({
        spec: {
          containers: [
            { name: 'app', image: 'nginx', envFrom: [{ configMapRef: { name: 'my-cm' } }] },
          ],
        },
      });
      const refs = findPodReferences([pod], 'ConfigMap', 'my-cm');
      expect(refs[0].usages).toEqual([
        { kind: 'envFrom', container: 'app', isInitOrEphemeral: false },
      ]);
    });

    it('finds initContainers env/envFrom and marks isInitOrEphemeral=true', () => {
      const pod = makePod({
        spec: {
          containers: [{ name: 'app', image: 'nginx' }],
          initContainers: [
            { name: 'init', image: 'busybox', envFrom: [{ configMapRef: { name: 'my-cm' } }] },
          ],
        },
      });
      const refs = findPodReferences([pod], 'ConfigMap', 'my-cm');
      expect(refs[0].usages).toEqual([
        { kind: 'envFrom', container: 'init', isInitOrEphemeral: true },
      ]);
    });

    it('finds ephemeralContainers env/envFrom and marks isInitOrEphemeral=true', () => {
      const pod = makePod({
        spec: {
          containers: [{ name: 'app', image: 'nginx' }],
          ephemeralContainers: [
            { name: 'debug', image: 'busybox', envFrom: [{ configMapRef: { name: 'my-cm' } }] },
          ],
        },
      });
      const refs = findPodReferences([pod], 'ConfigMap', 'my-cm');
      expect(refs[0].usages).toEqual([
        { kind: 'envFrom', container: 'debug', isInitOrEphemeral: true },
      ]);
    });

    it('finds direct configMap volume', () => {
      const pod = makePod({
        spec: {
          containers: [{ name: 'app', image: 'nginx' }],
          volumes: [{ name: 'cfg', configMap: { name: 'my-cm' } }],
        },
      });
      const refs = findPodReferences([pod], 'ConfigMap', 'my-cm');
      expect(refs[0].usages).toEqual([{ kind: 'volume', volume: 'cfg' }]);
    });

    it('finds projected.sources[].configMap', () => {
      const pod = makePod({
        spec: {
          containers: [{ name: 'app', image: 'nginx' }],
          volumes: [
            {
              name: 'proj',
              projected: { sources: [{ configMap: { name: 'my-cm' } }] },
            },
          ],
        },
      });
      const refs = findPodReferences([pod], 'ConfigMap', 'my-cm');
      expect(refs[0].usages).toEqual([{ kind: 'projected', volume: 'proj' }]);
    });
  });

  describe('Secret reference paths', () => {
    it('finds env.valueFrom.secretKeyRef', () => {
      const pod = makePod({
        spec: {
          containers: [
            {
              name: 'app',
              image: 'nginx',
              env: [{ name: 'X', valueFrom: { secretKeyRef: { name: 'my-secret', key: 'k' } } }],
            },
          ],
        },
      });
      expect(findPodReferences([pod], 'Secret', 'my-secret')[0].usages).toEqual([
        { kind: 'env', container: 'app', isInitOrEphemeral: false },
      ]);
    });

    it('finds envFrom.secretRef', () => {
      const pod = makePod({
        spec: {
          containers: [
            { name: 'app', image: 'nginx', envFrom: [{ secretRef: { name: 'my-secret' } }] },
          ],
        },
      });
      expect(findPodReferences([pod], 'Secret', 'my-secret')[0].usages).toEqual([
        { kind: 'envFrom', container: 'app', isInitOrEphemeral: false },
      ]);
    });

    it('finds direct secret volume by secretName (not name)', () => {
      const pod = makePod({
        spec: {
          containers: [{ name: 'app', image: 'nginx' }],
          // Crucial: Secret volumes use `secretName`, NOT `name`.
          volumes: [{ name: 'sec-vol', secret: { secretName: 'my-secret' } }],
        },
      });
      expect(findPodReferences([pod], 'Secret', 'my-secret')[0].usages).toEqual([
        { kind: 'volume', volume: 'sec-vol' },
      ]);
    });

    it('does NOT match secret volume when `name` is used instead of `secretName`', () => {
      const pod = makePod({
        spec: {
          containers: [{ name: 'app', image: 'nginx' }],
          volumes: [{ name: 'sec-vol', secret: { name: 'my-secret' } }],
        },
      });
      expect(findPodReferences([pod], 'Secret', 'my-secret')).toEqual([]);
    });

    it('finds projected.sources[].secret by name', () => {
      const pod = makePod({
        spec: {
          containers: [{ name: 'app', image: 'nginx' }],
          volumes: [{ name: 'proj', projected: { sources: [{ secret: { name: 'my-secret' } }] } }],
        },
      });
      expect(findPodReferences([pod], 'Secret', 'my-secret')[0].usages).toEqual([
        { kind: 'projected', volume: 'proj' },
      ]);
    });

    it('finds imagePullSecrets', () => {
      const pod = makePod({
        spec: {
          containers: [{ name: 'app', image: 'nginx' }],
          imagePullSecrets: [{ name: 'my-secret' }],
        },
      });
      expect(findPodReferences([pod], 'Secret', 'my-secret')[0].usages).toEqual([
        { kind: 'imagePullSecret' },
      ]);
    });
  });

  it('reports multiple usage sites for a single Pod', () => {
    const pod = makePod({
      spec: {
        containers: [
          { name: 'app', image: 'nginx', envFrom: [{ configMapRef: { name: 'my-cm' } }] },
        ],
        volumes: [{ name: 'cfg', configMap: { name: 'my-cm' } }],
      },
    });
    const refs = findPodReferences([pod], 'ConfigMap', 'my-cm');
    expect(refs).toHaveLength(1);
    expect(refs[0].usages).toHaveLength(2);
  });

  it('does not match Pods that reference a different resource with a similar name', () => {
    const pod = makePod({
      spec: {
        containers: [
          { name: 'app', image: 'nginx', envFrom: [{ configMapRef: { name: 'my-config' } }] },
        ],
      },
    });
    expect(findPodReferences([pod], 'ConfigMap', 'my-c')).toEqual([]);
    expect(findPodReferences([pod], 'ConfigMap', 'my-config-extra')).toEqual([]);
  });

  it('skips Pods without a spec', () => {
    const pod = { metadata: { name: 'p', namespace: 'default' } } as unknown as Pod;
    expect(findPodReferences([pod], 'ConfigMap', 'any')).toEqual([]);
  });
});

describe('UsedBySection', () => {
  const configMap = {
    metadata: { name: 'my-cm', namespace: 'default' },
    cluster: 'test',
  } as any;

  beforeEach(() => {
    podUseListMock.mockReset();
  });

  it('shows the empty-state message when no Pods reference the ConfigMap', () => {
    podUseListMock.mockReturnValue({ items: [makePod()], errors: null, isLoading: false });
    renderInContext(<UsedBySection resource={configMap} resourceKind="ConfigMap" />);
    expect(
      screen.getByText(/No Pods in this namespace reference this ConfigMap/)
    ).toBeInTheDocument();
  });

  it('shows a loading message before Pods are available', () => {
    podUseListMock.mockReturnValue({ items: null, errors: null, isLoading: true });
    renderInContext(<UsedBySection resource={configMap} resourceKind="ConfigMap" />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('surfaces fetch errors', () => {
    podUseListMock.mockReturnValue({
      items: null,
      errors: [new Error('boom')],
      isLoading: false,
    });
    renderInContext(<UsedBySection resource={configMap} resourceKind="ConfigMap" />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it('renders a row per referencing Pod with chips describing each usage', () => {
    const pod = makePod({
      name: 'consumer',
      ownerKind: 'Deployment',
      ownerName: 'web',
      spec: {
        containers: [
          { name: 'app', image: 'nginx', envFrom: [{ configMapRef: { name: 'my-cm' } }] },
        ],
        volumes: [{ name: 'cfg', configMap: { name: 'my-cm' } }],
      },
    });
    podUseListMock.mockReturnValue({ items: [pod], errors: null, isLoading: false });

    renderInContext(<UsedBySection resource={configMap} resourceKind="ConfigMap" />);

    expect(screen.getByText('consumer')).toBeInTheDocument();
    expect(screen.getByText('Deployment/web')).toBeInTheDocument();
    expect(screen.getByText(/envFrom \(app\)/)).toBeInTheDocument();
    expect(screen.getByText(/volume \(cfg\)/)).toBeInTheDocument();
  });
});
