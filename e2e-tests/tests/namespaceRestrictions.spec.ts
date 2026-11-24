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

import { expect, type Page, test, type WebSocketRoute } from '@playwright/test';

const selector = 'team=headlamp';
const emptySelector = 'team=none';
const otherSelector = 'team=backend';
const refreshSelector = 'team=refresh';
const panelCluster = 'test2';

function namespaceList(names: string[]) {
  return {
    apiVersion: 'v1',
    kind: 'NamespaceList',
    metadata: { resourceVersion: '1' },
    items: names.map(name => ({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name, resourceVersion: '1' },
      status: { phase: 'Active' },
    })),
  };
}

async function mockHeadlamp(
  page: Page,
  clusters: string[],
  resolveSelector: (cluster: string, requestedSelector: string) => Promise<string[]>
) {
  await page.route('**/config', route =>
    route.fulfill({
      json: {
        clusters: clusters.map(name => ({ name, auth_type: '', useToken: false })),
      },
    })
  );
  await page.route('**/plugins', route => route.fulfill({ json: [] }));
  await page.route('**/clusters/**', async route => {
    const url = new URL(route.request().url());
    const [cluster, ...clusterPathParts] = url.pathname.split('/clusters/')[1].split('/');
    const clusterPath = `/${clusterPathParts.join('/')}`;

    if (clusterPath === '/api') {
      await route.fulfill({
        json: {
          items: [
            {
              metadata: {},
              versions: [
                {
                  version: 'v1',
                  resources: [
                    {
                      resource: 'namespaces',
                      verbs: ['list'],
                      responseKind: { kind: 'Namespace' },
                      scope: 'Cluster',
                    },
                    {
                      resource: 'pods',
                      verbs: ['list'],
                      responseKind: { kind: 'Pod' },
                      scope: 'Namespaced',
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
      return;
    }

    if (clusterPath === '/apis') {
      await route.fulfill({ json: { items: [] } });
      return;
    }

    const requestedSelector = url.searchParams.get('labelSelector');
    if (
      clusterPath === '/api/v1/namespaces' &&
      requestedSelector &&
      [selector, emptySelector, otherSelector, refreshSelector].includes(requestedSelector)
    ) {
      await route.fulfill({
        json: namespaceList(await resolveSelector(cluster, requestedSelector)),
      });
      return;
    }

    const projectSelector = url.searchParams.get('labelSelector');
    if (
      clusterPath === '/api/v1/namespaces' &&
      projectSelector?.startsWith('headlamp.dev/project-id=')
    ) {
      const project = projectSelector.slice('headlamp.dev/project-id='.length);
      await route.fulfill({
        json: {
          ...namespaceList([`${project}-namespace`]),
          items: [
            {
              apiVersion: 'v1',
              kind: 'Namespace',
              metadata: {
                name: `${project}-namespace`,
                labels: { 'headlamp.dev/project-id': project },
                resourceVersion: '1',
              },
            },
          ],
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        apiVersion: 'v1',
        kind: 'List',
        metadata: { resourceVersion: '1' },
        items: [],
      },
    });
  });
}

function panelPod(namespace: string, name = 'listed-pod') {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace,
      uid: `${namespace}-${name}`,
      resourceVersion: '1',
    },
    spec: { containers: [{ name: 'main', image: 'busybox' }] },
    status: { phase: 'Running' },
  };
}

async function mockLegacyPanel(page: Page) {
  const podRequests: string[] = [];
  const watches: Array<{ socket: WebSocketRoute; path: string; closed: boolean }> = [];
  const isPanelPods = (path: string) =>
    new RegExp(`^/clusters/${panelCluster}/api/v1/(?:namespaces/[^/]+/)?pods$`).test(path);

  await page.route('**/version', route => route.fulfill({ json: { gitVersion: 'v1.36.0' } }));
  await page.route('**/plugins', route =>
    route.fulfill({
      json: [
        {
          name: 'e2e-namespace-panel',
          path: 'plugins/e2e-namespace-panel',
          type: 'user',
          source: 'user',
        },
      ],
    })
  );
  await page.route('**/plugins/e2e-namespace-panel/package.json', route =>
    route.fulfill({
      json: {
        name: 'e2e-namespace-panel',
        version: '1.0.0',
        devDependencies: { '@kinvolk/headlamp-plugin': '^0.10.0' },
      },
    })
  );
  await page.route('**/plugins/e2e-namespace-panel/main.js', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
      const { React, ReactRouter, K8s, registerUIPanel } = window.pluginLib;
      function NamespacePanel() {
        const [pods, setPods] = React.useState(null);
        const [error, setError] = React.useState('');
        const [filter, setFilter] = React.useState('');
        K8s.ResourceClasses.Pod.useApiList(setPods, error => setError(error.message), { cluster: '${panelCluster}' });
        return React.createElement('aside', { 'aria-label': 'Legacy namespace panel' },
          React.createElement('label', null, 'Panel state',
            React.createElement('input', { value: filter, onChange: event => setFilter(event.target.value) })),
          React.createElement(ReactRouter.Link, { to: '/settings/cluster?c=${panelCluster}' }, 'Edit namespace settings'),
          React.createElement(ReactRouter.Link, { to: '/project/create-yaml' }, 'Create YAML project'),
          React.createElement('output', { 'data-testid': 'legacy-pods' },
            pods === null ? 'Loading plugin pods' :
            pods.map(pod => pod.metadata.namespace + '/' + pod.metadata.name).join(', ') || 'No plugin pods'),
          React.createElement('output', { 'data-testid': 'legacy-error' }, error));
      }
      registerUIPanel({ id: 'e2e-namespace-panel', side: 'right', component: NamespacePanel });
    `,
    })
  );
  await page.route(
    url => isPanelPods(url.pathname),
    route => {
      const path = new URL(route.request().url()).pathname;
      podRequests.push(path);
      const namespace = path.match(/\/namespaces\/([^/]+)\/pods$/)?.[1] || 'unrestricted';
      return route.fulfill({
        json: {
          apiVersion: 'v1',
          kind: 'PodList',
          metadata: { resourceVersion: '1' },
          items: [panelPod(namespace)],
        },
      });
    }
  );
  await page.routeWebSocket('**', socket => {
    const path = new URL(socket.url()).pathname;
    if (isPanelPods(path)) {
      const watch = { socket, path, closed: false };
      watches.push(watch);
      socket.onClose(() => {
        watch.closed = true;
      });
    }
  });
  return { podRequests, watches };
}

test.describe('legacy namespace API', () => {
  test.use({ locale: 'en-US' });

  test('gates new routes and fails closed after a live selector edit', async ({ page }) => {
    const selectorRequests: string[] = [];
    let releaseSelector!: () => void;
    const selectorReleased = new Promise<void>(resolve => {
      releaseSelector = resolve;
    });
    await page.addInitScript(
      ({ clusters, selector }) => {
        for (const cluster of clusters) {
          localStorage.setItem(
            `cluster_settings.${cluster}`,
            JSON.stringify({ allowedNamespacesSelector: selector })
          );
        }
      },
      { clusters: ['test', panelCluster], selector }
    );
    await mockHeadlamp(page, ['test', panelCluster], async (cluster, requestedSelector) => {
      if (requestedSelector === selector) {
        selectorRequests.push(cluster);
        await selectorReleased;
      }
      return requestedSelector === emptySelector ? [] : ['allowed-a'];
    });
    const { podRequests, watches } = await mockLegacyPanel(page);
    const panel = page.getByRole('complementary', { name: 'Legacy namespace panel' });
    const pods = panel.getByTestId('legacy-pods');

    try {
      await page.goto('/');
      await expect(page.getByRole('tab', { name: 'Clusters', exact: true })).toBeVisible();
      await expect.poll(() => selectorRequests).toContain(panelCluster);
      await expect(pods).toHaveText('No plugin pods');
      expect(podRequests).toEqual([]);

      await panel.getByRole('link', { name: 'Create YAML project' }).click();
      await expect(page).toHaveURL(/\/project\/create-yaml$/);
      await expect.poll(() => selectorRequests).toContain('test');
      const projectName = page.getByRole('textbox', { name: 'Project Name', exact: true });
      await expect(projectName).toHaveCount(0);

      releaseSelector();
      await expect(projectName).toBeVisible();
      await expect(pods).toHaveText('allowed-a/listed-pod');
      await expect.poll(() => watches.filter(watch => !watch.closed).length).toBe(1);
      const initialWatch = watches.find(watch => !watch.closed);
      if (!initialWatch) throw new Error('The legacy Pod watch did not open');
      const addedPod = panelPod('allowed-a', 'watch-pod');
      addedPod.metadata.resourceVersion = '2';
      initialWatch.socket.send(
        JSON.stringify({
          type: 'ADDED',
          object: addedPod,
        })
      );
      await expect(pods).toContainText('allowed-a/watch-pod');
      await panel.getByRole('textbox', { name: 'Panel state' }).fill('keep panel state');

      await panel.getByRole('link', { name: 'Edit namespace settings' }).click();
      const input = page.getByRole('textbox', {
        name: 'Allowed namespaces label selector',
        exact: true,
      });
      await expect(input).toHaveValue(selector);
      await expect.poll(() => watches.filter(watch => !watch.closed).length).toBe(1);
      const activeWatch = watches.find(watch => !watch.closed);
      if (!activeWatch) throw new Error('The legacy Pod watch did not reconnect');
      await input.fill(emptySelector);
      await page.getByRole('button', { name: 'Apply label selector', exact: true }).click();

      await expect(
        page.getByText('No namespaces match this selector', { exact: true })
      ).toBeVisible();
      await expect(pods).toHaveText('No plugin pods');
      await expect.poll(() => activeWatch.closed).toBe(true);
      await expect(panel.getByRole('textbox', { name: 'Panel state' })).toHaveValue(
        'keep panel state'
      );
      await expect(panel.getByTestId('legacy-error')).toBeEmpty();
      expect(podRequests.length).toBeGreaterThan(0);
      expect(podRequests.every(path => path.endsWith('/namespaces/allowed-a/pods'))).toBe(true);
      expect(watches.every(watch => watch.path.endsWith('/namespaces/allowed-a/pods'))).toBe(true);
    } finally {
      releaseSelector();
    }
  });

  test('preserves editor/project state and fail-closed cache policy across tabs', async ({
    page,
  }) => {
    const selectorRequests: string[] = [];
    let releaseRefresh!: () => void;
    const refreshReleased = new Promise<void>(resolve => {
      releaseRefresh = resolve;
    });
    await page.addInitScript(
      ({ cluster, selector }) => {
        localStorage.setItem(
          `cluster_settings.${cluster}`,
          JSON.stringify({ allowedNamespacesSelector: selector })
        );
      },
      { cluster: panelCluster, selector }
    );
    await mockHeadlamp(page, ['test', panelCluster], async (cluster, requestedSelector) => {
      if (cluster === panelCluster) selectorRequests.push(requestedSelector);
      if (requestedSelector === refreshSelector) await refreshReleased;
      return requestedSelector === selector ? ['allowed-a'] : ['allowed-b'];
    });
    const { podRequests } = await mockLegacyPanel(page);
    const panel = page.getByRole('complementary', { name: 'Legacy namespace panel' });
    const pods = panel.getByTestId('legacy-pods');
    const input = page.getByRole('textbox', {
      name: 'Allowed namespaces label selector',
      exact: true,
    });
    await page.goto(`/settings/cluster?c=${panelCluster}`);
    await expect(pods).toHaveText('allowed-a/listed-pod');
    await expect(input).toHaveValue(selector);
    await panel.getByRole('textbox', { name: 'Panel state' }).fill('keep panel state');

    const writer = await page.context().newPage();
    await writer.route('**/e2e-storage-writer', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Namespace storage writer</title>',
      })
    );
    await writer.goto('/e2e-storage-writer');
    await writer.evaluate(
      ({ cluster, selector }) => {
        localStorage.setItem(
          `cluster_settings.${cluster}`,
          JSON.stringify({ allowedNamespacesSelector: selector })
        );
      },
      { cluster: panelCluster, selector: otherSelector }
    );
    await expect(input).toHaveValue(otherSelector);
    await expect(pods).toHaveText('allowed-b/listed-pod');
    const namespaceRequestsBeforeCacheLoss = selectorRequests.length;
    expect(namespaceRequestsBeforeCacheLoss).toBeGreaterThan(0);

    await writer.evaluate(cluster => {
      localStorage.removeItem(`cluster_allowed_namespaces_selector_cache.${cluster}`);
    }, panelCluster);
    await expect
      .poll(() =>
        page.evaluate(cluster => {
          const raw = localStorage.getItem(`cluster_allowed_namespaces_selector_cache.${cluster}`);
          return raw ? JSON.parse(raw).namespaces : null;
        }, panelCluster)
      )
      .toEqual(['allowed-b']);
    await expect(pods).toHaveText('allowed-b/listed-pod');
    await expect(input).toHaveValue(otherSelector);
    await expect(panel.getByRole('textbox', { name: 'Panel state' })).toHaveValue(
      'keep panel state'
    );
    await expect(panel.getByTestId('legacy-error')).toBeEmpty();
    expect(selectorRequests).toContain(otherSelector);
    expect(selectorRequests).toHaveLength(namespaceRequestsBeforeCacheLoss);
    expect(podRequests.every(path => /\/namespaces\/allowed-[ab]\/pods$/.test(path))).toBe(true);

    await panel.getByRole('link', { name: 'Create YAML project' }).click();
    const projectName = page.getByRole('textbox', { name: 'Project Name', exact: true });
    await projectName.fill('keep project name');
    await page.getByLabel('Choose Files', { exact: true }).setInputFiles({
      name: 'project.yaml',
      mimeType: 'application/yaml',
      buffer: Buffer.from(
        'apiVersion: v1\nkind: Pod\nmetadata:\n  name: keep-yaml\nspec:\n  containers:\n  - name: main\n    image: busybox\n'
      ),
    });
    const loadedResource = page.getByRole('cell', { name: 'keep-yaml', exact: true });
    await expect(loadedResource).toBeVisible();

    try {
      await writer.evaluate(
        ({ cluster, selector }) => {
          localStorage.setItem(
            `cluster_settings.${cluster}`,
            JSON.stringify({ allowedNamespacesSelector: selector })
          );
        },
        { cluster: panelCluster, selector: refreshSelector }
      );
      await expect.poll(() => selectorRequests.includes(refreshSelector)).toBe(true);
      await expect(pods).toHaveText('No plugin pods');
      await expect(projectName).toHaveValue('keep project name');
      await expect(loadedResource).toBeVisible();
    } finally {
      releaseRefresh();
    }
    await expect(pods).toHaveText('allowed-b/listed-pod');
    await expect(projectName).toHaveValue('keep project name');
    await expect(loadedResource).toBeVisible();

    const requestsBeforePeerFailure = selectorRequests.length;
    await writer.evaluate(
      ({ cluster, selector }) => {
        localStorage.setItem(
          `cluster_allowed_namespaces_selector_cache.${cluster}`,
          JSON.stringify({
            selector,
            namespaces: [],
            resolvedAt: Date.now(),
          })
        );
      },
      { cluster: panelCluster, selector: refreshSelector }
    );
    await expect(pods).toHaveText('No plugin pods');
    await expect
      .poll(() =>
        page.evaluate(cluster => {
          const cache = localStorage.getItem(
            `cluster_allowed_namespaces_selector_cache.${cluster}`
          );
          return cache ? JSON.parse(cache).namespaces : null;
        }, panelCluster)
      )
      .toEqual([]);
    await panel.getByRole('link', { name: 'Edit namespace settings' }).click();
    await expect(input).toHaveValue(refreshSelector);
    await expect(pods).toHaveText('No plugin pods');
    expect(
      await page.evaluate(cluster => {
        const cache = localStorage.getItem(`cluster_allowed_namespaces_selector_cache.${cluster}`);
        return cache ? JSON.parse(cache).namespaces : null;
      }, panelCluster)
    ).toEqual([]);
    expect(selectorRequests).toHaveLength(requestsBeforePeerFailure);
    expect(podRequests.every(path => /\/namespaces\/allowed-[ab]\/pods$/.test(path))).toBe(true);
  });
});

test('an empty namespace selector suppresses namespaced requests', async ({ page }) => {
  const podRequests: string[] = [];

  await page.addInitScript(selector => {
    localStorage.setItem(
      'cluster_settings.test',
      JSON.stringify({ allowedNamespacesSelector: selector })
    );
    localStorage.setItem(
      'cluster_allowed_namespaces_selector_cache.test',
      JSON.stringify({ selector, namespaces: [], resolvedAt: Date.now() })
    );
  }, selector);
  await mockHeadlamp(page, ['test'], async () => []);
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/api\/v1\/(?:namespaces\/[^/]+\/)?pods$/.test(url.pathname)) {
      podRequests.push(`${url.pathname}${url.search}`);
    }
  });

  await page.goto('/c/test/pods?namespace=default');
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('cluster_allowed_namespaces_selector_cache.test'))
    )
    .not.toBeNull();

  await expect(page).toHaveTitle(/Pods/);
  await expect(page.getByText('No data to be shown.').first()).toBeVisible();
  expect(podRequests).toEqual([]);
});

test('an empty namespace selector suppresses the unrestricted Namespaces query', async ({
  page,
}) => {
  const unrestrictedNamespaceRequests: string[] = [];

  await page.addInitScript(selector => {
    localStorage.setItem(
      'cluster_settings.test',
      JSON.stringify({ allowedNamespacesSelector: selector })
    );
    localStorage.setItem(
      'cluster_allowed_namespaces_selector_cache.test',
      JSON.stringify({ selector, namespaces: [], resolvedAt: Date.now() })
    );
  }, selector);
  await mockHeadlamp(page, ['test'], async () => []);
  page.on('request', request => {
    const url = new URL(request.url());
    if (
      url.pathname.endsWith('/clusters/test/api/v1/namespaces') &&
      !url.searchParams.has('labelSelector')
    ) {
      unrestrictedNamespaceRequests.push(`${url.pathname}${url.search}`);
    }
  });

  await page.goto('/c/test/namespaces');
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('cluster_allowed_namespaces_selector_cache.test'))
    )
    .not.toBeNull();

  await expect(page).toHaveTitle(/Namespaces/);
  await expect(page.getByText('No data to be shown.').first()).toBeVisible();
  expect(unrestrictedNamespaceRequests).toEqual([]);
});

test('a disjoint cluster allow-list does not become a cluster-wide request', async ({ page }) => {
  const podRequests: string[] = [];

  await page.addInitScript(selector => {
    for (const [cluster, namespaces] of [
      ['test', ['team-a']],
      ['test2', ['team-b']],
    ] as const) {
      localStorage.setItem(
        `cluster_settings.${cluster}`,
        JSON.stringify({ allowedNamespacesSelector: selector })
      );
      localStorage.setItem(
        `cluster_allowed_namespaces_selector_cache.${cluster}`,
        JSON.stringify({ selector, namespaces, resolvedAt: Date.now() })
      );
    }
  }, selector);
  await mockHeadlamp(page, ['test', 'test2'], async cluster =>
    cluster === 'test' ? ['team-a'] : ['team-b']
  );
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/api\/v1\/(?:namespaces\/[^/]+\/)?pods$/.test(url.pathname)) {
      podRequests.push(`${url.pathname}${url.search}`);
    }
  });

  await page.goto('/c/test+test2/pods?namespace=team-a');

  await expect(page).toHaveTitle(/Pods/);
  await expect
    .poll(() =>
      podRequests.some(request => request.includes('/clusters/test/api/v1/namespaces/team-a/pods'))
    )
    .toBe(true);
  expect(podRequests.some(request => /\/api\/v1\/pods(?:\?|$)/.test(request))).toBe(false);
});

test('all selected cluster selectors start resolving before routes render', async ({ page }) => {
  const selectorRequests = new Set<string>();
  let releaseFirstSelector!: () => void;
  const firstSelectorReleased = new Promise<void>(resolve => {
    releaseFirstSelector = resolve;
  });

  await page.addInitScript(selector => {
    for (const cluster of ['test', 'test2']) {
      localStorage.setItem(
        `cluster_settings.${cluster}`,
        JSON.stringify({ allowedNamespacesSelector: selector })
      );
    }
  }, selector);
  await mockHeadlamp(page, ['test', 'test2'], async cluster => {
    selectorRequests.add(cluster);
    if (cluster === 'test') {
      await firstSelectorReleased;
    }
    return [];
  });

  try {
    await page.goto('/c/test+test2/pods', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => [...selectorRequests].sort()).toEqual(['test', 'test2']);
    await expect(page).toHaveTitle('Headlamp');
  } finally {
    releaseFirstSelector();
  }

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          ['test', 'test2'].every(cluster =>
            localStorage.getItem(`cluster_allowed_namespaces_selector_cache.${cluster}`)
          )
        ),
      { timeout: 10_000 }
    )
    .toBe(true);
  await expect(page).toHaveTitle(/Pods/);
});

test('a global project route resolves configured cluster selectors', async ({ page }) => {
  const selectorRequests = new Set<string>();

  await page.addInitScript(selector => {
    for (const cluster of ['test', 'test2']) {
      localStorage.setItem(
        `cluster_settings.${cluster}`,
        JSON.stringify({ allowedNamespacesSelector: selector })
      );
    }
  }, selector);
  await mockHeadlamp(page, ['test', 'test2'], async cluster => {
    selectorRequests.add(cluster);
    return ['project-namespace'];
  });

  await page.goto('/project/example');

  await expect
    .poll(() => [...selectorRequests].sort(), { timeout: 10_000 })
    .toEqual(['test', 'test2']);
  await expect(page).toHaveTitle(/Project Details/);
});

test('the home Projects view resolves configured cluster selectors', async ({ page }) => {
  const selectorRequests = new Set<string>();

  await page.addInitScript(selector => {
    for (const cluster of ['test', 'test2']) {
      localStorage.setItem(
        `cluster_settings.${cluster}`,
        JSON.stringify({ allowedNamespacesSelector: selector })
      );
    }
  }, selector);
  await mockHeadlamp(page, ['test', 'test2'], async cluster => {
    selectorRequests.add(cluster);
    return ['project-namespace'];
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Projects' }).click();

  await expect
    .poll(() => [...selectorRequests].sort(), { timeout: 10_000 })
    .toEqual(['test', 'test2']);
});

test('a cluster route does not resolve unselected cluster selectors', async ({ page }) => {
  const selectorRequests = new Set<string>();

  await page.addInitScript(selector => {
    for (const cluster of ['test', 'test2']) {
      localStorage.setItem(
        `cluster_settings.${cluster}`,
        JSON.stringify({ allowedNamespacesSelector: selector })
      );
    }
  }, selector);
  await mockHeadlamp(page, ['test', 'test2'], async cluster => {
    selectorRequests.add(cluster);
    return [];
  });

  await page.goto('/c/test/pods');

  await expect(page).toHaveTitle(/Pods/);
  expect([...selectorRequests]).toEqual(['test']);
});

test('a selector refresh preserves routed page state', async ({ page }) => {
  const podRequests: string[] = [];
  let releaseSelector!: () => void;
  const selectorReleased = new Promise<void>(resolve => {
    releaseSelector = resolve;
  });

  await page.addInitScript(selector => {
    localStorage.setItem(
      'cluster_settings.test',
      JSON.stringify({ allowedNamespacesSelector: selector })
    );
    localStorage.setItem(
      'cluster_allowed_namespaces_selector_cache.test',
      JSON.stringify({
        selector,
        namespaces: ['stale'],
        resolvedAt: Date.now(),
      })
    );
  }, selector);
  await mockHeadlamp(page, ['test'], async () => {
    await selectorReleased;
    return ['fresh'];
  });
  await page.route('**/clusters/test/api/v1/namespaces/*/pods**', route => {
    const namespace = new URL(route.request().url()).pathname
      .split('/namespaces/')[1]
      .split('/')[0];
    return route.fulfill({
      json: {
        apiVersion: 'v1',
        kind: 'PodList',
        metadata: { resourceVersion: '1' },
        items: [
          {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: `keep-state-visible-${namespace}`,
              namespace,
              resourceVersion: '1',
              creationTimestamp: '2026-01-01T00:00:00Z',
            },
            spec: { containers: [{ name: 'main', image: 'busybox' }] },
            status: { phase: 'Running' },
          },
        ],
      },
    });
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/api\/v1\/namespaces\/[^/]+\/pods$/.test(url.pathname)) {
      podRequests.push(`${url.pathname}${url.search}`);
    }
  });

  try {
    await page.goto('/c/test/pods', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Pods/);
    await page.getByRole('button', { name: 'Show/Hide search' }).click();
    const search = page.locator('#table-search-field');
    await search.fill('keep this filter');

    releaseSelector();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const cache = localStorage.getItem('cluster_allowed_namespaces_selector_cache.test');
          return cache ? JSON.parse(cache).namespaces : null;
        })
      )
      .toEqual(['fresh']);
    await expect
      .poll(() =>
        podRequests.some(request => request.includes('/clusters/test/api/v1/namespaces/fresh/pods'))
      )
      .toBe(true);
    await expect(search).toHaveValue('keep this filter');
  } finally {
    releaseSelector();
  }
});
