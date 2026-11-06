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

import type { Route } from '@playwright/test';
import { expect, test } from '@playwright/test';

const sources = [
  {
    id: 'cluster_inventory',
    label: 'Cluster Inventory API',
    nameLabel: 'ClusterProfile',
    configured: true,
    columns: [
      { key: 'namespace', label: 'Resource namespace' },
      { key: 'provider', label: 'Access provider' },
    ],
    summaryFields: ['namespace', 'provider'],
  },
  {
    id: 'cluster_api',
    label: 'Cluster API',
    nameLabel: 'Cluster',
    configured: true,
    columns: [
      { key: 'namespace', label: 'Resource namespace' },
      { key: 'root', label: 'Management context' },
    ],
    detailFields: [{ key: 'secret', label: 'Kubeconfig Secret' }],
    summaryFields: ['namespace', 'root'],
  },
  {
    id: 'fleet',
    label: 'Fleet',
    nameLabel: 'Fleet cluster',
    configured: true,
    columns: [{ key: 'region', label: 'Region' }],
    summaryFields: ['region'],
  },
  { id: 'empty', label: 'Empty source', nameLabel: 'Name', configured: true, columns: [] },
];
function connection(
  name: string,
  source: string,
  displayName: string,
  fields: Record<string, string>
) {
  return { name, auth_type: '', meta_data: { source, presentation: { displayName, fields } } };
}
const clusters = [
  connection('inventory-direct', 'cluster_inventory', 'production', {
    namespace: 'team-a',
    provider: 'direct',
    root: 'in-cluster',
  }),
  connection('inventory-gateway', 'cluster_inventory', 'production', {
    namespace: 'team-a',
    provider: 'gateway',
    root: 'in-cluster',
  }),
  connection('inventory-team-b', 'cluster_inventory', 'production', {
    namespace: 'team-b',
    provider: 'direct',
    root: 'in-cluster',
  }),
  connection('capi-production', 'cluster_api', 'production', {
    namespace: 'workloads',
    secret: 'production-kubeconfig',
    root: 'management',
  }),
  connection('fleet-staging', 'fleet', 'staging', { region: 'ap-northeast-1' }),
  {
    name: 'legacy-plugin',
    auth_type: '',
    meta_data: { source: 'custom_plugin', sourceLabel: 'Custom plugin' },
  },
];
const config = {
  clusters,
  clusterSources: sources,
  isDynamicClusterEnabled: false,
  oidcAutoLogin: false,
};

async function respond(route: Route, data: unknown) {
  await route.fulfill({
    json: data,
    headers: {
      'access-control-allow-origin': route.request().headers().origin || '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    },
  });
}

test.describe('Cluster source views', () => {
  test.use({ locale: 'en-US' });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('i18nextLng')) localStorage.setItem('i18nextLng', 'en');
    });
    await page.route('**/config', route => respond(route, config));
    await page.route(/\/plugins(?:\/list)?$/, route => respond(route, []));
    await page.route(/\/clusters\//, route =>
      respond(
        route,
        new URL(route.request().url()).pathname.endsWith('/version')
          ? { gitVersion: 'v1.37.0' }
          : { kind: 'List', metadata: { resourceVersion: '1' }, items: [] }
      )
    );
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'All (6)', exact: true })).toBeVisible();
  });

  test('renders registered text columns, configured empty sources and unknown plugin sources', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Cluster Inventory API (3)', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: /ClusterProfile/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Access provider/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'production', exact: true })).toHaveCount(3);
    await page.getByRole('tab', { name: 'Cluster API (1)', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: /Management context/ })).toBeVisible();
    await expect(page.getByText('management', { exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Kubeconfig Secret/ })).toHaveCount(0);
    await expect(page.getByText('production-kubeconfig', { exact: true })).toHaveCount(0);
    await page
      .getByRole('row')
      .filter({ hasText: 'management' })
      .getByRole('button', { name: 'Actions', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Connection details', exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Connection details', exact: true });
    await expect(details.getByText('production-kubeconfig', { exact: true })).toBeVisible();
    await expect(details.getByText('Management context', { exact: true })).toHaveCount(1);
    await details.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('tab', { name: 'Fleet (1)', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: /Region/ })).toBeVisible();
    await expect(page.getByText('ap-northeast-1', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Empty source (0)', exact: true }).click();
    await expect(page.getByText('No clusters found in Empty source')).toBeVisible();
    await page.getByRole('tab', { name: 'Custom plugin (1)', exact: true }).click();
    await expect(page.getByRole('link', { name: 'legacy-plugin' })).toBeVisible();
  });

  test('links source tabs to their results and supports keyboard selection', async ({ page }) => {
    const tabs = page.getByRole('tablist', { name: 'Cluster sources', exact: true });
    const all = tabs.getByRole('tab', { name: 'All (6)', exact: true });
    const panel = page.getByRole('tabpanel', { name: 'All (6)', exact: true });
    await expect(panel).toHaveAttribute('id', (await all.getAttribute('aria-controls'))!);
    await expect(panel).toHaveAttribute('aria-labelledby', (await all.getAttribute('id'))!);
    await all.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const inventory = tabs.getByRole('tab', { name: 'Cluster Inventory API (3)', exact: true });
    await expect(inventory).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('tabpanel', { name: 'Cluster Inventory API (3)', exact: true })
    ).toBeVisible();
    await expect(panel).not.toBeVisible();
  });

  test('keeps configured empty sources reachable with one management cluster', async ({ page }) => {
    const management = { name: 'main', auth_type: '', meta_data: { source: 'incluster' } };
    await page.route('**/config', route =>
      respond(route, {
        ...config,
        clusters: [management],
        clusterSources: sources.slice(0, 2),
      })
    );
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'All (1)', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Cluster Inventory API (0)', exact: true }).click();
    await expect(page.getByText('No clusters found in Cluster Inventory API')).toBeVisible();
    await page.goto('/c/main/');
    const home = page
      .getByRole('navigation', { name: 'Navigation', exact: true })
      .getByRole('button', { name: 'Home', exact: true });
    await expect(home).toBeVisible();
    await home.click();
    await expect(page.getByRole('tab', { name: 'Cluster API (0)', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Cluster API (0)', exact: true }).click();
    await expect(page.getByText('No clusters found in Cluster API')).toBeVisible();

    await page.route('**/config', route =>
      respond(route, { ...config, clusters: [management], clusterSources: [] })
    );
    await page.goto('/');
    await expect(page).toHaveURL(/\/c\/main\/?$/);
  });

  test('preserves the single-cluster logout redirect when discovery is enabled', async ({
    page,
  }) => {
    await page.route('**/config', route =>
      respond(route, {
        ...config,
        clusters: [{ name: 'main', auth_type: '', meta_data: { source: 'incluster' } }],
      })
    );
    await page.goto('/?logout=true');
    await expect(page).toHaveURL(
      url => url.pathname.endsWith('/login') && url.searchParams.get('logout') === 'true'
    );
  });

  test('translates existing source labels and updates them when the language changes', async ({
    page,
  }) => {
    await page.route('**/config', route =>
      respond(route, {
        ...config,
        clusterSources: [],
        clusters: [
          { name: 'plugin-connection', auth_type: '', meta_data: { source: 'dynamic_cluster' } },
          { name: 'management', auth_type: '', meta_data: { source: 'incluster' } },
          { name: 'unknown-connection', auth_type: '', meta_data: {} },
          {
            name: 'custom-connection',
            auth_type: '',
            meta_data: { source: 'custom', sourceLabel: 'My custom source' },
          },
        ],
      })
    );
    await page.evaluate(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto('/');
    for (const label of ['插件', '集群内', '未知', 'My custom source']) {
      await expect(page.getByRole('cell', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: '插件 (1)', exact: true })).toBeVisible();
    await page.evaluate(() => localStorage.setItem('i18nextLng', 'en'));
    await page.reload();
    for (const label of ['Plugin', 'In-cluster', 'Unknown', 'My custom source']) {
      await expect(page.getByRole('cell', { name: label, exact: true })).toBeVisible();
    }
    await expect(
      page.getByRole('link', { name: 'plugin-connection', exact: true })
    ).toHaveAttribute('href', '/c/plugin-connection/');
  });

  test('keeps common origin details for legacy servers and sources without columns', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Custom plugin (1)', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: /Origin/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Custom plugin', exact: true })).toBeVisible();

    await page.route('**/config', route =>
      respond(route, {
        clusters: [
          {
            name: 'legacy-context',
            auth_type: '',
            meta_data: { source: 'kubeconfig', origin: { kubeconfig: '/home/test/.kube/config' } },
          },
          {
            name: 'other-context',
            auth_type: '',
            meta_data: { source: 'kubeconfig', origin: { kubeconfig: '/etc/kubernetes/config' } },
          },
        ],
      })
    );
    await page.goto('/');
    await page.getByRole('tab', { name: 'Kubeconfig (2)', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: /Origin/ })).toBeVisible();
    await expect(
      page.getByText('Kubeconfig: /home/test/.kube/config', { exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Show/Hide search', exact: true }).click();
    await page.locator('#table-search-field').fill('/home/test/.kube/config');
    await expect(
      page.getByRole('table').getByRole('link', { name: 'legacy-context' })
    ).toBeVisible();
  });

  test('preserves searches for visible versions, statuses and presentation fields', async ({
    page,
  }) => {
    const table = page.getByRole('table');
    await page.getByRole('button', { name: 'Show/Hide search', exact: true }).click();
    const search = page.locator('#table-search-field');
    await search.fill('no-matching-connection');
    await expect(table.getByRole('link')).toHaveCount(0);
    await search.fill('Not connected');
    await expect(table.getByRole('link')).toHaveCount(6);
    await search.clear();
    const gateway = table.getByRole('row').filter({ hasText: 'gateway' });
    await gateway.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(gateway.getByText('v1.37.0', { exact: true })).toBeVisible();
    for (const value of ['v1.37.0', 'Active', 'gateway']) {
      await search.fill(value);
      await expect(table.getByRole('link')).toHaveCount(1);
      await expect(table.getByRole('link')).toHaveAttribute('href', '/c/inventory-gateway/');
    }
    await search.fill('Not connected');
    await expect(table.getByRole('link')).toHaveCount(5);
    await search.fill('workloads');
    await expect(table.getByRole('link')).toHaveCount(1);
    await expect(table.getByRole('link')).toHaveAttribute('href', '/c/capi-production/');
    await search.fill('no-matching-connection');
    await expect(table.getByRole('link')).toHaveCount(0);
  });

  test('truncates long display names with a source summary within the sidebar', async ({
    page,
  }) => {
    const longName = 'production-'.repeat(32);
    await page.route('**/config', route =>
      respond(route, {
        ...config,
        clusters: clusters.map(cluster =>
          cluster.name === 'inventory-direct'
            ? connection(cluster.name, 'cluster_inventory', longName, {
                namespace: 'team-a',
                provider: 'direct',
                root: 'in-cluster',
              })
            : cluster
        ),
      })
    );
    await page.goto('/c/inventory-direct/');
    const navigation = page.getByRole('navigation', { name: 'Navigation', exact: true });
    const label = navigation.getByText(longName, { exact: true });
    await expect(label).toBeVisible();
    const metrics = await label.evaluate(element => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      right: element.getBoundingClientRect().right,
    }));
    const bounds = (await navigation.boundingBox())!;
    expect(metrics.width).toBeGreaterThan(0);
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.width);
    expect(metrics.right).toBeLessThanOrEqual(bounds.x + bounds.width);
  });

  test('isolates visibility and sorting and resets selected rows between tabs', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Cluster Inventory API (3)', exact: true }).click();
    const gateway = page.getByRole('row').filter({ hasText: 'gateway' });
    await gateway.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(gateway.getByText('Active', { exact: true })).toBeVisible();
    await gateway.getByRole('checkbox').click();
    await expect(gateway).toHaveAttribute('data-selected', 'true');
    await expect(page.getByRole('button', { name: 'View Clusters', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Cluster API (1)', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'View Clusters', exact: true })
    ).not.toBeVisible();
    await page.getByRole('tab', { name: 'Cluster Inventory API (3)', exact: true }).click();
    await expect(gateway.getByRole('checkbox')).not.toBeChecked();
    await page.getByRole('button', { name: 'Show/Hide columns', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Resource namespace', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('columnheader', { name: /Resource namespace/ })).not.toBeVisible();
    await page.getByRole('columnheader', { name: /Access provider/ }).click();
    const links = page.getByRole('table').getByRole('link');
    const order = await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    await page.getByRole('tab', { name: 'Cluster API (1)', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: /Resource namespace/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Cluster Inventory API (3)', exact: true }).click();
    await expect
      .poll(() => links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))))
      .toEqual(order);
    await page.reload();
    await expect(
      page.getByRole('tab', { name: 'Cluster Inventory API (3)', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('columnheader', { name: /Resource namespace/ })).not.toBeVisible();
  });

  test('refreshes source definitions and supplementary fields without changing connection IDs', async ({
    page,
  }) => {
    test.setTimeout(45000);
    const updatedSources = sources.map(source =>
      source.id === 'cluster_inventory'
        ? {
            ...source,
            nameLabel: 'Profile name',
          }
        : source
    );
    await page.getByRole('tab', { name: 'Cluster Inventory API (3)', exact: true }).click();
    await page.route('**/config', route =>
      respond(route, { ...config, clusterSources: updatedSources })
    );
    await expect(page.getByRole('columnheader', { name: /Profile name/ })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('tab', { name: 'All (6)', exact: true }).click();
    const updatedClusters = clusters.map(cluster =>
      cluster.name === 'inventory-gateway'
        ? {
            ...cluster,
            meta_data: {
              source: 'cluster_inventory',
              presentation: {
                displayName: 'production',
                fields: { namespace: 'team-a', provider: 'tunnel', root: 'in-cluster' },
              },
            },
          }
        : cluster
    );
    await page.route('**/config', route =>
      respond(route, { ...config, clusters: updatedClusters, clusterSources: updatedSources })
    );
    await expect(
      page.getByText('Cluster Inventory API · team-a · tunnel', { exact: true })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page
        .getByRole('link')
        .filter({ hasText: 'production' })
        .filter({ has: page.getByText('Cluster Inventory API · team-a · tunnel', { exact: true }) })
    ).toHaveAttribute('href', '/c/inventory-gateway/');
    await page.route('**/config', route =>
      respond(route, {
        clusters: clusters.map(cluster => ({
          name: cluster.name,
          auth_type: cluster.auth_type,
          meta_data: { source: cluster.meta_data.source },
        })),
      })
    );
    await expect(page.getByRole('tab', { name: 'Empty source (0)', exact: true })).not.toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('link', { name: 'inventory-gateway', exact: true })).toBeVisible();
  });

  test('opens the selected provider and keeps raw IDs in settings and recent selections', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Cluster Inventory API (3)', exact: true }).click();
    const gateway = page.getByRole('row').filter({ hasText: 'gateway' });
    await gateway.getByRole('button', { name: 'Actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Connection details', exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Connection details', exact: true });
    await expect(details.getByText('inventory-gateway', { exact: true })).toBeVisible();
    await expect(details.getByRole('button', { name: 'Copy to clipboard' })).toBeVisible();
    await details.getByRole('button', { name: 'Close', exact: true }).click();
    await gateway.getByRole('link', { name: 'production', exact: true }).click();
    await expect(page).toHaveURL(/\/c\/inventory-gateway\/?$/);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('recent_clusters') || '[]')))
      .toContain('inventory-gateway');
    await page.goto('/settings/cluster?c=inventory-gateway');
    await page.getByRole('combobox', { name: 'Cluster', exact: true }).click();
    await page.getByRole('option', { name: /team-b.*direct/ }).click();
    await expect(page).toHaveURL(/c=inventory-team-b/);
  });
});
