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

import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import { buildExportKubeconfigYaml, configWithSelectedClusters } from './kubeconfigExport';

const fullConfig = {
  clusters: [
    { name: 'cluster-a', cluster: { server: 'https://a.example.invalid' } },
    { name: 'cluster-b', cluster: { server: 'https://b.example.invalid' } },
    { name: 'cluster-c', cluster: { server: 'https://c.example.invalid' } },
  ],
  users: [
    { name: 'user-a', user: { token: 'token-a' } },
    { name: 'user-b', user: { token: 'token-b' } },
    { name: 'user-c', user: { token: 'token-c' } },
  ],
  contexts: [
    { name: 'ctx-a', context: { cluster: 'cluster-a', user: 'user-a' } },
    { name: 'ctx-b', context: { cluster: 'cluster-b', user: 'user-b' } },
    { name: 'ctx-c', context: { cluster: 'cluster-c', user: 'user-c' } },
  ],
  currentContext: 'ctx-a',
};

describe('configWithSelectedClusters', () => {
  it('keeps only the selected contexts and the clusters/users they reference', () => {
    const filtered = configWithSelectedClusters(fullConfig, ['ctx-a', 'ctx-c']);

    expect(filtered.contexts.map(c => c.name)).toEqual(['ctx-a', 'ctx-c']);
    expect(filtered.clusters.map(c => c.name)).toEqual(['cluster-a', 'cluster-c']);
    expect(filtered.users.map(u => u.name)).toEqual(['user-a', 'user-c']);
  });

  it('deduplicates clusters and users shared by multiple selected contexts', () => {
    const sharedConfig = {
      ...fullConfig,
      contexts: [
        { name: 'ctx-a', context: { cluster: 'cluster-a', user: 'user-a' } },
        { name: 'ctx-a2', context: { cluster: 'cluster-a', user: 'user-a' } },
      ],
    };

    const filtered = configWithSelectedClusters(sharedConfig, ['ctx-a', 'ctx-a2']);

    expect(filtered.contexts).toHaveLength(2);
    expect(filtered.clusters).toHaveLength(1);
    expect(filtered.users).toHaveLength(1);
  });

  it('ignores selected names that do not match any context', () => {
    const filtered = configWithSelectedClusters(fullConfig, ['ctx-a', 'nope']);

    expect(filtered.contexts.map(c => c.name)).toEqual(['ctx-a']);
  });
});

describe('buildExportKubeconfigYaml', () => {
  it('produces a portable kubeconfig with only the selected entries', () => {
    const exported = yaml.load(buildExportKubeconfigYaml(fullConfig, ['ctx-b'])) as any;

    expect(exported.apiVersion).toBe('v1');
    expect(exported.kind).toBe('Config');
    expect(exported['current-context']).toBe('ctx-b');
    expect(exported.contexts).toHaveLength(1);
    expect(exported.contexts[0].name).toBe('ctx-b');
    expect(exported.clusters).toHaveLength(1);
    expect(exported.clusters[0].name).toBe('cluster-b');
    expect(exported.users).toHaveLength(1);
    expect(exported.users[0].name).toBe('user-b');
  });

  it('excludes credentials of contexts that were not selected', () => {
    const exported = yaml.load(buildExportKubeconfigYaml(fullConfig, ['ctx-a'])) as any;

    const yamlText = buildExportKubeconfigYaml(fullConfig, ['ctx-a']);
    expect(yamlText).not.toContain('token-b');
    expect(yamlText).not.toContain('token-c');
    expect(yamlText).toContain('token-a');
    expect(exported.clusters).toHaveLength(1);
  });

  it('falls back to the first retained context when no selected name survives filtering', () => {
    // e.g. renamed contexts where the selected name no longer matches the stored one.
    const exported = yaml.load(buildExportKubeconfigYaml(fullConfig, ['renamed-away'])) as any;

    expect(exported['current-context']).toBe('');
  });
});
