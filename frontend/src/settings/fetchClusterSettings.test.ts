/*
 * Copyright 2026 The Kubernetes Authors
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

import { describe, expect, it, vi } from 'vitest';
import { encodeBase64 } from '../helpers/base64';
import { clusterFetch } from '../lib/k8s/api/v2/fetch';
import { fetchAllClusterSettings, fetchSource } from './fetchClusterSettings';

vi.mock('../lib/k8s/api/v2/fetch', () => ({
  clusterFetch: vi.fn(),
}));

describe('fetchSource', () => {
  const clusterName = 'bravo';

  it('correctly decodes UTF-8 text from Secret data', async () => {
    const jsonString = JSON.stringify({
      plugins: { demo: { label: 'café', desc: '🚀 multi-byte' } },
    });
    const encoded = encodeBase64(jsonString);

    vi.mocked(clusterFetch).mockResolvedValueOnce({
      json: async () => ({
        data: {
          'settings.json': encoded,
        },
      }),
    } as any);

    const result = await fetchSource(clusterName, {
      name: 'example-settings',
      type: 'Secret',
      namespace: 'headlamp-tools',
    });

    expect(result).toEqual({
      plugins: {
        demo: {
          label: 'café',
          desc: '🚀 multi-byte',
        },
      },
    });
  });

  it('loads plain UTF-8 text from ConfigMap data', async () => {
    const jsonString = JSON.stringify({ plugins: { demo: { label: 'café' } } });

    vi.mocked(clusterFetch).mockResolvedValueOnce({
      json: async () => ({
        data: {
          'settings.json': jsonString,
        },
      }),
    } as any);

    const result = await fetchSource(clusterName, {
      name: 'example-config',
      type: 'ConfigMap',
      namespace: 'headlamp-tools',
    });

    expect(result).toEqual({
      plugins: {
        demo: {
          label: 'café',
        },
      },
    });
  });

  it('handles standard ASCII Secret settings', async () => {
    const jsonString = JSON.stringify({ timezone: 'UTC' });
    const encoded = btoa(jsonString);

    vi.mocked(clusterFetch).mockResolvedValueOnce({
      json: async () => ({
        data: {
          'settings.json': encoded,
        },
      }),
    } as any);

    const result = await fetchSource(clusterName, {
      name: 'ascii-settings',
      type: 'Secret',
    });

    expect(result).toEqual({ timezone: 'UTC' });
  });

  it('returns null when secret data is missing settings.json', async () => {
    vi.mocked(clusterFetch).mockResolvedValueOnce({
      json: async () => ({
        data: {},
      }),
    } as any);

    const result = await fetchSource(clusterName, {
      name: 'missing-settings',
      type: 'Secret',
    });

    expect(result).toBeNull();
  });

  it('returns null when clusterFetch rejects or fails', async () => {
    vi.mocked(clusterFetch).mockRejectedValueOnce(new Error('Forbidden'));

    const result = await fetchSource(clusterName, {
      name: 'forbidden-settings',
      type: 'Secret',
    });

    expect(result).toBeNull();
  });
});

describe('fetchAllClusterSettings', () => {
  it('loads UTF-8 Secret settings for an explicitly named cluster', async () => {
    const bravoSettings = { plugins: { demo: { label: 'café' } } };
    const encoded = encodeBase64(JSON.stringify(bravoSettings));

    vi.mocked(clusterFetch).mockResolvedValueOnce({
      json: async () => ({
        data: {
          'settings.json': encoded,
        },
      }),
    } as any);

    const result = await fetchAllClusterSettings(
      {
        bravo: [{ name: 'example-settings', type: 'Secret', namespace: 'headlamp-tools' }],
      },
      ['bravo']
    );

    expect(result).toEqual({
      bravo: {
        plugins: {
          demo: {
            label: 'café',
          },
        },
      },
    });
  });
});
