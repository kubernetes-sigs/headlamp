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

import { createInstance } from 'i18next';
import { Cluster } from '../lib/k8s/cluster';
import {
  createClusterPresentation,
  getClusterDisplayName,
  getClusterSearchText,
  getClusterSourceViews,
  translateClusterLabel,
} from './clusterPresentation';

const sources = [
  {
    id: 'fleet',
    label: 'Fleet',
    nameLabel: 'Name',
    columns: [{ key: 'region', label: 'Region' }],
    summaryFields: ['namespace', 'provider'],
    configured: true,
  },
];
const connection = (id: string, fields = {}): Cluster => ({
  name: id,
  auth_type: 'oidc',
  meta_data: {
    source: 'fleet',
    presentation: {
      displayName: 'production',
      fields: { namespace: 'team-a', provider: 'oidc', root: 'store/management', ...fields },
    },
  },
});

it('prefers custom names, then public names, without changing the connection key', () => {
  const cluster = connection('opaque-id');
  expect(getClusterDisplayName(cluster)).toBe('production');
  cluster.meta_data!.extensions = { headlamp_info: { customName: 'Custom production' } };
  expect(getClusterDisplayName(cluster)).toBe('Custom production');
  expect(cluster.name).toBe('opaque-id');
  expect(getClusterDisplayName({ name: 'legacy', auth_type: '' })).toBe('legacy');
});

it('distinguishes providers and namespaces, then roots, then connection IDs', () => {
  const clusters = [
    connection('oidc-a'),
    connection('oidc-b', { namespace: 'team-b' }),
    connection('vpn', { provider: 'vpn' }),
  ];
  let presentation = createClusterPresentation(clusters, sources);
  expect(presentation.getLabel(clusters[0]).text).toBe('production · Fleet · team-a · oidc');
  clusters.push(connection('another-root', { root: 'store/second' }));
  presentation = createClusterPresentation(clusters, sources);
  expect(presentation.getLabel(clusters[0]).secondary).toContain('store/management');
  expect(presentation.getLabel(clusters[3]).secondary).toContain('store/second');
  clusters.push(connection('duplicate'));
  presentation = createClusterPresentation(clusters, sources);
  expect(presentation.getLabel(clusters[0]).secondary).toContain('oidc-a');
  expect(presentation.getLabel(clusters[4]).secondary).toContain('duplicate');
});

it('looks up IDs and uses translated source labels without changing names or fields', () => {
  const cluster = connection('opaque-id');
  const presentation = createClusterPresentation([cluster], sources, label =>
    label === 'Fleet' ? 'Flotte' : label
  );
  expect(presentation.getLabel('opaque-id').text).toBe('production · Flotte · team-a · oidc');
  expect(presentation.getLabel('opaque-id')).toBe(presentation.getLabel(cluster));
  expect(presentation.getLabel('unknown-id').text).toBe('unknown-id');
  expect(presentation.getLabel({ name: 'outside-list', auth_type: '' }).name).toBe('outside-list');
});

it('translates source labels and columns and falls back for custom labels', async () => {
  const instance = createInstance();
  await instance.init({
    lng: 'ja',
    fallbackLng: 'en',
    resources: {
      ja: {
        translation: {
          'Cluster API': 'クラスターAPI',
          'Access provider': 'アクセスプロバイダー',
          Fleet: 'フリート',
        },
      },
    },
  });
  const translate = (label: string) => translateClusterLabel(label, instance.t.bind(instance));

  expect(translate('Cluster API')).toBe('クラスターAPI');
  expect(translate('Access provider')).toBe('アクセスプロバイダー');
  expect(translate('Fleet')).toBe('フリート');
  expect(translate('Custom source')).toBe('Custom source');

  await instance.changeLanguage('en');
  expect(translate('Cluster API')).toBe('Cluster API');
  expect(translate('Fleet')).toBe('Fleet');
});

it('searches raw IDs and public fields and retains configured empty or unknown sources', () => {
  const cluster = connection('opaque-id', { region: 'ap-northeast-1' });
  const search = getClusterSearchText(cluster, sources);
  for (const value of ['opaque-id', 'production', 'Fleet', 'team-a', 'oidc', 'ap-northeast-1'])
    expect(search).toContain(value);
  const unknown = {
    name: 'legacy',
    auth_type: '',
    meta_data: { source: 'unknown_plugin', sourceLabel: 'Custom plugin' },
  };
  const views = getClusterSourceViews([unknown], sources);
  expect(views.map(view => view.label)).toEqual(['Fleet', 'Custom plugin']);
  expect(views[1].columns).toBeUndefined();
});
