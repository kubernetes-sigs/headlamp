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
import { KubeContainer } from '../../../lib/k8s/cluster';
import { KubePod } from '../../../lib/k8s/pod';

const { MockKubeObject } = vi.hoisted(() => {
  class MockKubeObject {
    jsonData: any;
    static kind = '';
    constructor(data: any) {
      this.jsonData = data;
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

import { buildEnvironmentVariables, extractEnvVarReferences } from './Resource';

describe('buildEnvironmentVariables', () => {
  const dummyPod = {
    metadata: {
      name: 'test-pod',
      namespace: 'default',
      creationTimestamp: '2025-01-01T00:00:00Z',
    },
  } as unknown as KubePod;

  const dummyContainer: KubeContainer = {
    name: 'test-container',
    image: 'nginx',
    imagePullPolicy: 'IfNotPresent',
  };

  it('correctly decodes secrets with multibyte UTF-8 data for secretKeyRef', () => {
    const utf8SecretValue = 'pässwörd_🚀_日本語_العربية';
    const base64Encoded = Base64.encode(utf8SecretValue);

    const container: KubeContainer = {
      ...dummyContainer,
      env: [
        {
          name: 'UTF8_SECRET_KEY',
          valueFrom: {
            secretKeyRef: {
              name: 'my-utf8-secret',
              key: 'API_KEY',
            },
          },
        },
      ],
    };

    const references = extractEnvVarReferences(container);

    const fetchedSecrets = new Map([
      [
        'my-utf8-secret',
        {
          resource: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            data: {
              API_KEY: base64Encoded,
            },
          } as any,
          error: null,
        },
      ],
    ]);

    const fetchedConfigMaps = new Map();

    const variables = buildEnvironmentVariables(
      references,
      fetchedSecrets,
      fetchedConfigMaps,
      dummyPod,
      container,
      '2025-01-01T00:00:00Z'
    );

    expect(variables).toHaveLength(1);
    expect(variables[0]).toEqual({
      key: 'UTF8_SECRET_KEY',
      value: utf8SecretValue,
      from: expect.anything(),
      isError: false,
      isSecret: true,
      isOutOfSync: false,
    });
  });

  it('correctly decodes secrets with multibyte UTF-8 data for secretRef (envFrom)', () => {
    const utf8SecretValue1 = 'token_with_accent_éèà';
    const utf8SecretValue2 = 'emoji_secret_🔑✨';

    const container: KubeContainer = {
      ...dummyContainer,
      envFrom: [
        {
          secretRef: {
            name: 'app-secrets',
          },
          prefix: 'APP_',
        },
      ],
    };

    const references = extractEnvVarReferences(container);

    const fetchedSecrets = new Map([
      [
        'app-secrets',
        {
          resource: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            data: {
              SECRET_ONE: Base64.encode(utf8SecretValue1),
              SECRET_TWO: Base64.encode(utf8SecretValue2),
            },
          } as any,
          error: null,
        },
      ],
    ]);

    const fetchedConfigMaps = new Map();

    const variables = buildEnvironmentVariables(
      references,
      fetchedSecrets,
      fetchedConfigMaps,
      dummyPod,
      container,
      '2025-01-01T00:00:00Z'
    );

    expect(variables).toHaveLength(2);
    expect(variables.find(v => v.key === 'APP_SECRET_ONE')?.value).toBe(utf8SecretValue1);
    expect(variables.find(v => v.key === 'APP_SECRET_TWO')?.value).toBe(utf8SecretValue2);
  });
});
