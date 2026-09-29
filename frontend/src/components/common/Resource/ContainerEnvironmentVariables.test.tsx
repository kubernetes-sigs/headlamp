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
import { fireEvent, render } from '@testing-library/react';
import { Base64 } from 'js-base64';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KubeContainer } from '../../../lib/k8s/cluster';
import { KubePod } from '../../../lib/k8s/pod';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';

// The k8s classes form an import cycle through lib/k8s/index.ts, so the base class is
// stubbed the same way EnvironmentVariables.test.ts does it.
const { MockKubeObject } = vi.hoisted(() => {
  class MockKubeObject {
    jsonData: any;
    cluster: string | undefined;
    static kind = '';
    constructor(data: any, cluster?: string) {
      this.jsonData = data;
      this.cluster = cluster;
    }
    get kind() {
      return this.jsonData?.kind;
    }
    get metadata() {
      return this.jsonData?.metadata;
    }
    // Pod exposes spec/status off jsonData, and ContainerInfo hands its resource
    // straight to ContainerEnvironmentVariables as a KubePod.
    get spec() {
      return this.jsonData?.spec;
    }
    get status() {
      return this.jsonData?.status;
    }
  }
  return { MockKubeObject };
});

vi.mock('../../../lib/k8s/KubeObject', () => ({ KubeObject: MockKubeObject }));
vi.mock('../../../lib/k8s/deployment', () => ({ default: class extends MockKubeObject {} }));
vi.mock('../../../lib/k8s/replicaSet', () => ({ default: class extends MockKubeObject {} }));
vi.mock('../../../lib/k8s/statefulSet', () => ({ default: class extends MockKubeObject {} }));
vi.mock('../../../lib/k8s/daemonSet', () => ({ default: class extends MockKubeObject {} }));
vi.mock('../../../lib/k8s/job', () => ({ default: class extends MockKubeObject {} }));
vi.mock('../../../lib/k8s/pod', () => ({ default: class extends MockKubeObject {} }));
vi.mock('../../../lib/k8s/secret', () => ({
  default: class Secret extends MockKubeObject {
    static kind = 'Secret';
    static detailsRoute = 'secret';
    static useGet = vi.fn(() => [null, null]);
    get data() {
      return this.jsonData?.data;
    }
  },
}));
vi.mock('../../../lib/k8s/configMap', () => ({
  default: class ConfigMap extends MockKubeObject {
    static kind = 'ConfigMap';
    static detailsRoute = 'configMap';
    static useGet = vi.fn(() => [null, null]);
    get data() {
      return this.jsonData?.data;
    }
  },
}));

import ConfigMap from '../../../lib/k8s/configMap';
import Secret from '../../../lib/k8s/secret';
import { ContainerEnvironmentVariables, ContainerInfo } from './Resource';

const NAMESPACE = 'default';
const POD_CLUSTER = 'cluster-b';
const SECRET_NAME = 'app-secrets';
const CONFIGMAP_NAME = 'app-config';

const podJson = {
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: 'test-pod',
    namespace: NAMESPACE,
    uid: 'pod-uid',
    creationTimestamp: '2025-01-01T00:00:00Z',
  },
  status: {
    containerStatuses: [{ name: 'test-container', started: true }],
  },
};

const container: KubeContainer = {
  name: 'test-container',
  image: 'nginx',
  imagePullPolicy: 'IfNotPresent',
  env: [
    {
      name: 'API_KEY',
      valueFrom: { secretKeyRef: { name: SECRET_NAME, key: 'API_KEY' } },
    },
    {
      name: 'LOG_LEVEL',
      valueFrom: { configMapKeyRef: { name: CONFIGMAP_NAME, key: 'LOG_LEVEL' } },
    },
  ],
};

const theme = createMuiTheme({ base: 'light', name: 'light' });

function withContext(children: React.ReactNode) {
  return (
    <TestContext>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </TestContext>
  );
}

function renderInContext(children: React.ReactNode) {
  return render(withContext(children));
}

/** Options passed to a mocked useGet on its most recent call. */
function lastUseGetOptions(resourceClass: any) {
  const calls = resourceClass.useGet.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][2];
}

/** A Secret from `cluster` whose API_KEY decodes to `plaintext`. */
function makeSecret(plaintext: string, cluster = POD_CLUSTER) {
  return new (Secret as any)(
    {
      kind: 'Secret',
      apiVersion: 'v1',
      metadata: { name: SECRET_NAME, namespace: NAMESPACE, uid: 'secret-uid' },
      data: { API_KEY: Base64.encode(plaintext) },
    },
    cluster
  );
}

afterEach(() => {
  // resetAllMocks also drops any per-test useGet return value, restoring the pending
  // default the mocks were created with.
  vi.resetAllMocks();
  // Link reads the URL cluster from window.location, so tests that set one undo it here.
  window.history.pushState({}, '', '/');
});

describe('ContainerEnvironmentVariables cluster scoping', () => {
  it('resolves referenced Secrets against the given cluster', () => {
    renderInContext(
      <ContainerEnvironmentVariables
        pod={podJson as unknown as KubePod}
        container={container}
        cluster={POD_CLUSTER}
      />
    );

    expect(Secret.useGet).toHaveBeenCalledWith(SECRET_NAME, NAMESPACE, { cluster: POD_CLUSTER });
  });

  it('resolves referenced ConfigMaps against the given cluster', () => {
    renderInContext(
      <ContainerEnvironmentVariables
        pod={podJson as unknown as KubePod}
        container={container}
        cluster={POD_CLUSTER}
      />
    );

    expect(ConfigMap.useGet).toHaveBeenCalledWith(CONFIGMAP_NAME, NAMESPACE, {
      cluster: POD_CLUSTER,
    });
  });

  // Without a cluster the lookup keeps falling back to the current one, which is the
  // behaviour every existing caller relies on.
  it('leaves the cluster undefined when none is given', () => {
    renderInContext(
      <ContainerEnvironmentVariables pod={podJson as unknown as KubePod} container={container} />
    );

    expect(lastUseGetOptions(Secret)).toEqual({ cluster: undefined });
    expect(lastUseGetOptions(ConfigMap)).toEqual({ cluster: undefined });
  });

  it("forwards the pod's own cluster from ContainerInfo", () => {
    const pod = new (MockKubeObject as any)(podJson, POD_CLUSTER);

    renderInContext(
      <ContainerInfo
        resource={pod}
        container={container}
        status={{ name: 'test-container', started: true } as any}
      />
    );

    expect(lastUseGetOptions(Secret)).toEqual({ cluster: POD_CLUSTER });
    expect(lastUseGetOptions(ConfigMap)).toEqual({ cluster: POD_CLUSTER });
  });

  it('links "From" to the resource in the pod cluster rather than the URL cluster', () => {
    // The URL stays on cluster-a while the pod on screen belongs to cluster-b, which is
    // what the resource map and the details drawer produce.
    window.history.pushState({}, '', '/c/cluster-a/pods/default/test-pod');
    (Secret as any).useGet.mockReturnValue([makeSecret('cluster-b-password'), null]);

    const { getByRole } = renderInContext(
      <ContainerEnvironmentVariables
        pod={podJson as unknown as KubePod}
        container={container}
        cluster={POD_CLUSTER}
      />
    );

    const href = getByRole('link', { name: `Secret: ${SECRET_NAME}` }).getAttribute('href');
    expect(href).toMatch(/^\/c\/cluster-b\b/);
    expect(href).not.toMatch(/^\/c\/cluster-a\b/);
  });
});

describe('ContainerEnvironmentVariables scope changes', () => {
  const otherNamespacePod = {
    ...podJson,
    metadata: { ...podJson.metadata, namespace: 'other-namespace' },
  };

  // A reused instance keeps its fetched maps, and a pending lookup reports nothing to
  // replace them with, so without a reset the previous values would stay on screen.
  it.each([
    ['cluster', { pod: podJson, cluster: 'cluster-b' }],
    ['namespace', { pod: otherNamespacePod, cluster: 'cluster-a' }],
  ])(
    'drops values fetched before the %s changed while the new lookup is pending',
    (_label, next) => {
      const secretA = makeSecret('cluster-a-password', 'cluster-a');
      (Secret as any).useGet.mockImplementation((_name: string, namespace: string, opts: any) =>
        namespace === NAMESPACE && opts?.cluster === 'cluster-a' ? [secretA, null] : [null, null]
      );

      const { getByRole, getByDisplayValue, queryByDisplayValue, queryByText, rerender } =
        renderInContext(
          <ContainerEnvironmentVariables
            pod={podJson as unknown as KubePod}
            container={container}
            cluster="cluster-a"
          />
        );
      fireEvent.click(getByRole('button', { name: /toggle field visibility/i }));
      expect(getByDisplayValue('cluster-a-password')).toBeInTheDocument();

      rerender(
        withContext(
          <ContainerEnvironmentVariables
            pod={next.pod as unknown as KubePod}
            container={container}
            cluster={next.cluster}
          />
        )
      );

      expect(queryByDisplayValue('cluster-a-password')).not.toBeInTheDocument();
      expect(queryByText('API_KEY')).not.toBeInTheDocument();
    }
  );
});

describe('ContainerEnvironmentVariables secret values', () => {
  it('decodes a Secret fetched from the pod cluster', () => {
    const plaintext = 'cluster-b-password';
    (Secret as any).useGet.mockReturnValue([makeSecret(plaintext), null]);

    const { getByRole, getByDisplayValue } = renderInContext(
      <ContainerEnvironmentVariables
        pod={podJson as unknown as KubePod}
        container={container}
        cluster={POD_CLUSTER}
      />
    );

    fireEvent.click(getByRole('button', { name: /toggle field visibility/i }));

    expect(getByDisplayValue(plaintext)).toBeInTheDocument();
  });
});
