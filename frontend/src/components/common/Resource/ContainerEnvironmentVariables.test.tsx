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
import { fireEvent, render, screen } from '@testing-library/react';
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
    static kind = '';
    constructor(data: any) {
      this.jsonData = data;
    }
    get kind() {
      return this.jsonData?.kind;
    }
    get metadata() {
      return this.jsonData?.metadata;
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
    static useGet = vi.fn();
    get data() {
      return this.jsonData?.data;
    }
  },
}));

import Secret from '../../../lib/k8s/secret';
import { ContainerEnvironmentVariables } from './Resource';

const SECRET_NAME = 'my-secret';
const SECRET_KEY = 'API_KEY';

const pod = {
  metadata: {
    name: 'test-pod',
    namespace: 'default',
    creationTimestamp: '2025-01-01T00:00:00Z',
  },
  status: {
    containerStatuses: [{ name: 'test-container', started: true }],
  },
} as unknown as KubePod;

const container: KubeContainer = {
  name: 'test-container',
  image: 'nginx',
  imagePullPolicy: 'IfNotPresent',
  env: [
    {
      name: SECRET_KEY,
      valueFrom: {
        secretKeyRef: { name: SECRET_NAME, key: SECRET_KEY },
      },
    },
  ],
};

/** Stubs Secret.useGet so the fetcher resolves with a Secret holding `plaintext`. */
function mockSecretValue(plaintext: string) {
  const secret = new (Secret as any)({
    kind: 'Secret',
    apiVersion: 'v1',
    metadata: {
      name: SECRET_NAME,
      namespace: 'default',
      uid: 'secret-uid',
      creationTimestamp: '2025-01-01T00:00:00Z',
    },
    data: { [SECRET_KEY]: Base64.encode(plaintext) },
    type: 'Opaque',
  });

  (Secret as any).useGet.mockReturnValue([secret, null]);
}

const theme = createMuiTheme({ base: 'light', name: 'light' });

function renderEnvVars() {
  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ContainerEnvironmentVariables pod={pod} container={container} />
      </ThemeProvider>
    </TestContext>
  );
}

/** Clicks the eye button so SecretField decodes and shows the value. */
function revealSecret() {
  fireEvent.click(screen.getByRole('button', { name: /toggle field visibility/i }));
}

describe('ContainerEnvironmentVariables', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // btoa() only accepts Latin-1, so encoding an already-decoded Secret value with it
  // threw InvalidCharacterError and took down the whole Containers section.
  it.each([
    ['Cyrillic', 'пароль'],
    ['CJK', '日本語'],
    ['emoji', 'pw🔐'],
    ['mixed multibyte', 'pässwörd_🚀_日本語_العربية'],
  ])('renders a secret env var holding %s without throwing', (_label, plaintext) => {
    mockSecretValue(plaintext);

    expect(() => renderEnvVars()).not.toThrow();
    expect(screen.getByText(SECRET_KEY)).toBeInTheDocument();
  });

  it.each([
    ['multibyte', 'pässwörd_🚀_日本語'],
    // Latin-1 supplement characters do not make btoa throw. It emits one byte per
    // character, which is not valid UTF-8 on its own, so revealing the value used to
    // show a replacement character instead of the real one.
    ['Latin-1 supplement', 'café'],
    ['ASCII', 'plain-password'],
  ])('reveals the original %s secret value', (_label, plaintext) => {
    mockSecretValue(plaintext);
    renderEnvVars();

    revealSecret();

    expect(screen.getByDisplayValue(plaintext)).toBeInTheDocument();
  });
});
